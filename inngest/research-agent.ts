/**
 * inngest/research-agent.ts
 *
 * 5-phase async research pipeline, orchestrated by Inngest.
 * Each step.run() gets independent retry logic; Inngest checkpoints
 * completed steps so a mid-run failure resumes from the last incomplete phase.
 *
 * Phase summary:
 *   P1 – Crunchbase discovery     (company profile + founders)
 *   P2 – Entity enrichment        (LinkedIn URLs via SerpAPI)
 *   P3 – Research scrape          (Semantic Scholar papers + SerpAPI Patents)
 *   P4 – News refresh             (SerpAPI Google News — reuses fetch-intel logic)
 *   P5 – Claude synthesis         (single Anthropic call for relevance scoring)
 *
 * Cost model: Claude is called ONCE in P5 with pre-structured data.
 * All other phases are deterministic API calls — no Claude tokens spent.
 */

import { inngest } from './client'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

// ─── Admin Supabase client (bypasses RLS) ─────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─── Anthropic client ─────────────────────────────────────────────────────

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── Progress helper ──────────────────────────────────────────────────────

async function setProgress(
  researchJobId: string,
  pct: number,
  message: string,
  completedPhase?: string
) {
  const patch: Record<string, unknown> = {
    progress_pct: pct,
    progress_message: message,
    status: pct === 100 ? 'complete' : 'running',
  }
  if (pct >= 5 && !patch.started_at) patch.started_at = new Date().toISOString()
  if (pct === 100) patch.completed_at = new Date().toISOString()

  await supabaseAdmin.from('research_jobs').update(patch).eq('id', researchJobId)

  if (completedPhase) {
    await supabaseAdmin.rpc('append_phase_complete', {
      job_id: researchJobId,
      phase_name: completedPhase,
    })
  }
}

// ─── Intel material-event scanner ────────────────────────────────────────
// Exported so it can be used by the fetch-intel route to auto-trigger refreshes.

const MATERIAL_EVENT_RE = [
  /raises?\s+\$[\d.]+[mb]/i,
  /series\s+[a-f]\b/i,
  /new\s+ceo\b/i,
  /appoints\s+new/i,
  /\bacquires?\b/i,
  /\bmerges?\s+with\b/i,
  /\bipo\b/i,
  /\blayoffs?\b/i,
  /funding\s+round/i,
]

export function detectMaterialEvent(title: string, summary: string | null): boolean {
  const text = `${title} ${summary ?? ''}`
  return MATERIAL_EVENT_RE.some((re) => re.test(text))
}

// ─── P1: Crunchbase ───────────────────────────────────────────────────────

interface CrunchbaseResult {
  short_description: string | null
  description: string | null
  founded_year: number | null
  employee_count_label: string | null
  employee_count_min: number | null
  employee_count_max: number | null
  total_funding_usd: number | null
  last_round_type: string | null
  last_round_date: string | null
  crunchbase_url: string | null
  linkedin_url: string | null
  twitter_url: string | null
  founders: Array<{ name: string; title: string }>
  raw: unknown
}

async function fetchCrunchbase(companyName: string): Promise<CrunchbaseResult | null> {
  const apiKey = process.env.CRUNCHBASE_API_KEY
  if (!apiKey) return null

  try {
    const searchRes = await fetch(
      `https://api.crunchbase.com/api/v4/searches/organizations?user_key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field_ids: [
            'short_description', 'num_employees_enum', 'funding_stage',
            'total_funding_usd', 'last_funding_type', 'last_funding_at',
            'founded_on', 'location_identifiers', 'website_url',
            'linkedin', 'twitter', 'identifier',
          ],
          query: [
            { type: 'predicate', field_id: 'facet_ids', operator_id: 'includes', values: ['company'] },
          ],
          predicate_filters: [
            { field_id: 'name', operator_id: 'contains', values: [companyName] },
          ],
          order: [{ field_id: 'rank_org', sort: 'asc' }],
          limit: 1,
        }),
      }
    )

    if (!searchRes.ok) {
      console.warn('Crunchbase search failed:', searchRes.status)
      return null
    }

    const searchData = await searchRes.json()
    const org = searchData.entities?.[0]
    if (!org) return null

    const props = org.properties ?? {}
    const permalink = org.identifier?.permalink ?? ''

    // Employee count range parsing
    const empEnum = props.num_employees_enum ?? ''
    const empRanges: Record<string, [number, number]> = {
      'c_00001_00010': [1, 10],   'c_00011_00050': [11, 50],
      'c_00051_00100': [51, 100], 'c_00101_00250': [101, 250],
      'c_00251_00500': [251, 500],'c_00501_01000': [501, 1000],
      'c_01001_05000': [1001, 5000], 'c_05001_10000': [5001, 10000],
      'c_10001_max': [10001, 0],
    }
    const [empMin, empMax] = empRanges[empEnum] ?? [null, null]
    const empLabel = empMin ? `${empMin}–${empMax || '10,000+'} employees` : null

    // Fetch founders (best-effort — Basic API may not return these)
    const founders: Array<{ name: string; title: string }> = []
    if (permalink) {
      try {
        const peopleRes = await fetch(
          `https://api.crunchbase.com/api/v4/entities/organizations/${permalink}/relationships/founders?user_key=${apiKey}&field_ids=first_name,last_name,primary_job_title`
        )
        if (peopleRes.ok) {
          const peopleData = await peopleRes.json()
          for (const p of peopleData.entities ?? []) {
            const pp = p.properties ?? {}
            const name = `${pp.first_name ?? ''} ${pp.last_name ?? ''}`.trim()
            if (name) founders.push({ name, title: pp.primary_job_title ?? 'Founder' })
          }
        }
      } catch {
        // founders endpoint may not be available on Basic tier — skip gracefully
      }
    }

    return {
      short_description: props.short_description ?? null,
      description:       null,
      founded_year:      props.founded_on?.value
        ? parseInt(props.founded_on.value.split('-')[0])
        : null,
      employee_count_label: empLabel,
      employee_count_min:   empMin ?? null,
      employee_count_max:   empMax ?? null,
      total_funding_usd:    props.total_funding_usd ?? null,
      last_round_type:      props.last_funding_type ?? null,
      last_round_date:      props.last_funding_at?.value ?? null,
      crunchbase_url: permalink
        ? `https://www.crunchbase.com/organization/${permalink}`
        : null,
      linkedin_url: props.linkedin?.value ?? null,
      twitter_url:  props.twitter?.value ?? null,
      founders,
      raw: org,
    }
  } catch (e) {
    console.error('fetchCrunchbase:', e)
    return null
  }
}

// ─── P2: Entity enrichment ────────────────────────────────────────────────

interface Entity {
  name: string
  title: string
  entity_type: 'founder' | 'executive'
  linkedin_url: string | null
  source: string
  source_url: string | null
}

async function searchForFounders(companyName: string): Promise<Entity[]> {
  const apiKey = process.env.SERP_API_KEY
  if (!apiKey) return []

  try {
    const q = `"${companyName}" founder OR CEO OR CTO site:linkedin.com/in`
    const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(q)}&api_key=${apiKey}&num=10`
    const res = await fetch(url)
    if (!res.ok) return []

    const data = await res.json()
    const entities: Entity[] = []

    for (const result of data.organic_results ?? []) {
      if (!result.link?.includes('linkedin.com/in/')) continue
      const name = result.title?.split(' - ')[0]?.split(' | ')[0]?.trim()
      if (!name || name.length < 3) continue
      entities.push({
        name,
        title: result.title?.split(' - ')[1]?.trim() ?? 'Executive',
        entity_type: 'founder',
        linkedin_url: result.link,
        source: 'serpapi',
        source_url: result.link,
      })
    }

    return entities.slice(0, 5)
  } catch (e) {
    console.error('searchForFounders:', e)
    return []
  }
}

async function enrichWithLinkedIn(
  founders: Array<{ name: string; title: string }>,
  companyName: string
): Promise<Entity[]> {
  const apiKey = process.env.SERP_API_KEY
  if (!apiKey) {
    return founders.map((f) => ({
      ...f, entity_type: 'founder' as const,
      linkedin_url: null, source: 'crunchbase', source_url: null,
    }))
  }

  const enriched: Entity[] = []
  for (const founder of founders.slice(0, 5)) {
    try {
      const q = `${founder.name} ${companyName} site:linkedin.com/in`
      const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(q)}&api_key=${apiKey}&num=3`
      const res = await fetch(url)
      const linkedinUrl = res.ok
        ? ((await res.json()).organic_results ?? [])
            .find((r: { link: string }) => r.link?.includes('linkedin.com/in/'))?.link ?? null
        : null

      enriched.push({
        name: founder.name, title: founder.title,
        entity_type: 'founder', linkedin_url: linkedinUrl,
        source: 'crunchbase', source_url: linkedinUrl,
      })
    } catch {
      enriched.push({
        name: founder.name, title: founder.title,
        entity_type: 'founder', linkedin_url: null, source: 'crunchbase', source_url: null,
      })
    }
  }
  return enriched
}

// ─── P3: Semantic Scholar papers ─────────────────────────────────────────

interface Paper {
  title: string
  authors: Array<{ name: string }>
  year: number | null
  abstract: string | null
  citation_count: number
  url: string | null
  doi: string | null
  source: string
  dedup_key: string
  entity_name: string
}

async function fetchPapersForEntities(
  entities: Array<{ id: string; name: string }>
): Promise<Paper[]> {
  const papers: Paper[] = []
  const seenDedup = new Set<string>()

  for (const entity of entities.slice(0, 5)) {
    try {
      const searchRes = await fetch(
        `https://api.semanticscholar.org/graph/v1/author/search?query=${encodeURIComponent(entity.name)}&fields=name,paperCount&limit=3`,
        { headers: { 'User-Agent': 'JobTracker/1.0 (research tool)' } }
      )
      if (!searchRes.ok) continue

      const { data } = await searchRes.json()
      const author = data?.[0]
      if (!author?.authorId) continue

      const papersRes = await fetch(
        `https://api.semanticscholar.org/graph/v1/author/${author.authorId}/papers?fields=title,year,abstract,citationCount,externalIds,url&limit=10`,
        { headers: { 'User-Agent': 'JobTracker/1.0 (research tool)' } }
      )
      if (!papersRes.ok) continue

      const { data: paperList } = await papersRes.json()
      for (const p of paperList ?? []) {
        const doi = p.externalIds?.DOI ?? null
        const dedup = doi
          ? `doi:${doi}`
          : `title:${(p.title ?? '').toLowerCase().replace(/\s+/g, ' ').trim()}`
        if (seenDedup.has(dedup)) continue
        seenDedup.add(dedup)

        papers.push({
          title:          p.title ?? 'Untitled',
          authors:        (p.authors ?? []).map((a: { name: string }) => ({ name: a.name })),
          year:           p.year ?? null,
          abstract:       p.abstract ?? null,
          citation_count: p.citationCount ?? 0,
          url:            p.url ?? (doi ? `https://doi.org/${doi}` : null),
          doi,
          source:         'semantic_scholar',
          dedup_key:      dedup,
          entity_name:    entity.name,
        })
      }

      // Respect Semantic Scholar rate limits (100 req/5min without API key)
      await new Promise((r) => setTimeout(r, 400))
    } catch (e) {
      console.error(`fetchPapers(${entity.name}):`, e)
    }
  }

  return papers
}

// ─── P3: SerpAPI Patents ──────────────────────────────────────────────────

interface Patent {
  title: string
  inventors: Array<{ name: string }>
  patent_number: string | null
  filing_date: string | null
  grant_date: string | null
  abstract: string | null
  url: string | null
  source: string
  dedup_key: string
  entity_name: string
}

async function fetchPatentsForEntities(
  entities: Array<{ name: string }>,
  companyName: string
): Promise<Patent[]> {
  const apiKey = process.env.SERP_API_KEY
  if (!apiKey) return []

  const patents: Patent[] = []
  const seenDedup = new Set<string>()

  for (const entity of entities.slice(0, 3)) {
    try {
      const q = `inventor:"${entity.name}" assignee:"${companyName}"`
      const url = `https://serpapi.com/search.json?engine=google_patents&q=${encodeURIComponent(q)}&api_key=${apiKey}&num=5`
      const res = await fetch(url)
      if (!res.ok) continue

      const data = await res.json()
      for (const patent of data.organic_results ?? []) {
        const dedup = patent.patent_id
          ?? `title:${(patent.title ?? '').toLowerCase().trim()}`
        if (seenDedup.has(dedup)) continue
        seenDedup.add(dedup)

        patents.push({
          title:          patent.title ?? 'Untitled',
          inventors:      [{ name: entity.name }],
          patent_number:  patent.patent_id ?? null,
          filing_date:    patent.filing_date ?? null,
          grant_date:     patent.grant_date ?? null,
          abstract:       patent.snippet ?? null,
          url:            patent.pdf ?? patent.link ?? null,
          source:         'google_patents',
          dedup_key:      dedup,
          entity_name:    entity.name,
        })
      }
    } catch (e) {
      console.error(`fetchPatents(${entity.name}):`, e)
    }
  }

  return patents
}

// ─── P4: News (inline — avoids HTTP self-call) ───────────────────────────

async function fetchNewsInternal(
  companyName: string, roleTitle: string
): Promise<Array<{
  source: string; item_type: string; title: string;
  url: string | null; summary: string | null;
  published_at: string; tags: string[]
}>> {
  const apiKey = process.env.SERP_API_KEY
  if (!apiKey) return []

  const queries = [
    `"${companyName}"`,
    `"${companyName}" ${roleTitle}`,
    `"${companyName}" funding news`,
    `"${companyName}" product launch`,
  ]

  const results = []
  const seenUrls = new Set<string>()

  for (const q of queries) {
    try {
      const url = `https://serpapi.com/search.json?engine=google_news&q=${encodeURIComponent(q)}&api_key=${apiKey}`
      const res = await fetch(url)
      if (!res.ok) continue
      const json = await res.json()
      for (const article of json.news_results ?? []) {
        const articleUrl = article.link ?? null
        if (articleUrl && seenUrls.has(articleUrl)) continue
        if (articleUrl) seenUrls.add(articleUrl)
        results.push({
          source: 'news', item_type: 'article',
          title: article.title ?? 'Untitled', url: articleUrl,
          summary: article.snippet ?? null,
          published_at: article.date
            ? new Date(article.date).toISOString()
            : new Date().toISOString(),
          tags: ['news', companyName.toLowerCase().replace(/\s+/g, '-')],
        })
      }
    } catch (e) {
      console.error(`fetchNewsInternal(${q}):`, e)
    }
  }
  return results
}

// ─── P5: Claude synthesis ─────────────────────────────────────────────────

async function claudeSynthesis(
  jobId: string,
  job: { company_name: string; role_title: string },
  papers: Paper[],
  patents: Patent[]
) {
  if (!papers.length && !patents.length) return

  // Cap at 30 items to keep context/cost bounded
  const items = [
    ...papers.map((p, i) => ({
      idx: i, type: 'paper' as const,
      title: p.title,
      abstract: (p.abstract ?? '').slice(0, 500),
      year: p.year,
      citations: p.citation_count,
      author: p.entity_name,
      dedup_key: p.dedup_key,
    })),
    ...patents.map((p, i) => ({
      idx: papers.length + i, type: 'patent' as const,
      title: p.title,
      abstract: (p.abstract ?? '').slice(0, 300),
      year: null, citations: 0,
      author: p.entity_name,
      dedup_key: p.dedup_key,
    })),
  ].slice(0, 30)

  const prompt = `You are evaluating research papers and patents for a candidate preparing to interview at ${job.company_name} for the role of "${job.role_title}".

For each item assign:
1. relevance_category — one of:
   - "core_to_company"  — foundational to what the company does or how it was built
   - "relevant_to_role" — directly applicable to the day-to-day job responsibilities
   - "tangential"       — same domain but not directly useful for this interview
   - "not_relevant"     — unrelated

2. relevance_score — float 0.00–1.00

3. relevance_note — 1–2 sentences. For high-relevance items include a specific insight the candidate could mention in an interview.

Items:
${JSON.stringify(items, null, 2)}

Respond ONLY with a JSON array (no markdown, no commentary):
[{"idx": 0, "relevance_category": "...", "relevance_score": 0.85, "relevance_note": "..."}, ...]`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    })

    const content = message.content[0]
    if (content.type !== 'text') return

    const jsonMatch = content.text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return

    const scores: Array<{
      idx: number
      relevance_category: string
      relevance_score: number
      relevance_note: string
    }> = JSON.parse(jsonMatch[0])

    // Write scores back
    for (const score of scores) {
      const patch = {
        relevance_category: score.relevance_category,
        relevance_score:    score.relevance_score,
        relevance_note:     score.relevance_note,
      }
      if (score.idx < papers.length) {
        await supabaseAdmin
          .from('research_papers')
          .update(patch)
          .eq('job_id', jobId)
          .eq('dedup_key', papers[score.idx].dedup_key)
      } else {
        const patent = patents[score.idx - papers.length]
        if (patent) {
          await supabaseAdmin
            .from('patents')
            .update(patch)
            .eq('job_id', jobId)
            .eq('dedup_key', patent.dedup_key)
        }
      }
    }
  } catch (e) {
    console.error('claudeSynthesis:', e)
    // Non-fatal — research data is still stored, just unscored
  }
}

// ─── Supabase write helpers ───────────────────────────────────────────────

async function upsertCompanyProfile(jobId: string, data: CrunchbaseResult) {
  await supabaseAdmin.from('company_profiles').upsert(
    {
      job_id:               jobId,
      short_description:    data.short_description,
      description:          data.description,
      founded_year:         data.founded_year,
      employee_count_label: data.employee_count_label,
      employee_count_min:   data.employee_count_min,
      employee_count_max:   data.employee_count_max,
      total_funding_usd:    data.total_funding_usd,
      last_round_type:      data.last_round_type,
      last_round_date:      data.last_round_date,
      crunchbase_url:       data.crunchbase_url,
      linkedin_url:         data.linkedin_url,
      twitter_url:          data.twitter_url,
      raw_crunchbase:       data.raw as object,
      last_crunchbase_fetch: new Date().toISOString(),
      updated_at:           new Date().toISOString(),
    },
    { onConflict: 'job_id' }
  )
}

async function upsertEntities(jobId: string, entities: Entity[]) {
  for (const e of entities) {
    const dedup_key = `${jobId}:${e.name.toLowerCase().replace(/\s+/g, ' ').trim()}`
    await supabaseAdmin.from('company_entities').upsert(
      {
        job_id: jobId, entity_type: e.entity_type,
        name: e.name, title: e.title,
        linkedin_url: e.linkedin_url,
        source: e.source, source_url: e.source_url,
        dedup_key,
      },
      { onConflict: 'dedup_key' }
    )
  }
}

async function upsertPapers(jobId: string, papers: Paper[]) {
  const { data: entityRows } = await supabaseAdmin
    .from('company_entities').select('id, name').eq('job_id', jobId)

  const entityMap: Record<string, string> = {}
  for (const e of entityRows ?? []) entityMap[e.name.toLowerCase().trim()] = e.id

  for (const paper of papers) {
    await supabaseAdmin.from('research_papers').upsert(
      {
        job_id:         jobId,
        entity_id:      entityMap[paper.entity_name.toLowerCase().trim()] ?? null,
        title:          paper.title,
        authors:        paper.authors,
        year:           paper.year,
        abstract:       paper.abstract,
        citation_count: paper.citation_count,
        url:            paper.url,
        doi:            paper.doi,
        source:         paper.source,
        dedup_key:      paper.dedup_key,
      },
      { onConflict: 'job_id,dedup_key' }
    )
  }
}

async function upsertPatents(jobId: string, patents: Patent[]) {
  const { data: entityRows } = await supabaseAdmin
    .from('company_entities').select('id, name').eq('job_id', jobId)

  const entityMap: Record<string, string> = {}
  for (const e of entityRows ?? []) entityMap[e.name.toLowerCase().trim()] = e.id

  for (const patent of patents) {
    await supabaseAdmin.from('patents').upsert(
      {
        job_id:         jobId,
        entity_id:      entityMap[patent.entity_name.toLowerCase().trim()] ?? null,
        title:          patent.title,
        inventors:      patent.inventors,
        patent_number:  patent.patent_number,
        filing_date:    patent.filing_date,
        grant_date:     patent.grant_date,
        abstract:       patent.abstract,
        url:            patent.url,
        source:         patent.source,
        dedup_key:      patent.dedup_key,
      },
      { onConflict: 'job_id,dedup_key' }
    )
  }
}

async function upsertNewsItems(
  items: Array<{
    source: string; item_type: string; title: string;
    url: string | null; summary: string | null;
    published_at: string; tags: string[]
  }>,
  jobId: string
) {
  if (!items.length) return
  const urls = items.map((i) => i.url).filter(Boolean) as string[]

  const { data: existing } = await supabaseAdmin
    .from('intel_items').select('url').eq('job_id', jobId).in('url', urls)

  const existingUrls = new Set((existing ?? []).map((r: { url: string }) => r.url))
  const newItems = items
    .filter((i) => i.url && !existingUrls.has(i.url!))
    .map((i) => ({ ...i, job_id: jobId }))

  if (newItems.length) {
    await supabaseAdmin.from('intel_items').insert(newItems)
  }
}

// ─── Main Inngest function ────────────────────────────────────────────────

export const researchAgent = inngest.createFunction(
  {
    id: 'research-agent',
    name: 'Job Research Agent',
    retries: 2,
    onFailure: async ({ error, event }) => {
      const { researchJobId } = event.data.event.data as { researchJobId: string }
      await supabaseAdmin.from('research_jobs').update({
        status: 'failed',
        error_message: String(error.message ?? error),
      }).eq('id', researchJobId)
    },
  },
  { event: 'research/job.created' },
  async ({ event, step }) => {
    const { jobId, researchJobId } = event.data as { jobId: string; researchJobId: string }

    // ── P1: Crunchbase discovery ──────────────────────────────────────────
    const { job, crunchbaseData } = await step.run('p1-discovery', async () => {
      await setProgress(researchJobId, 5, 'Looking up company on Crunchbase…')

      const { data: jobData } = await supabaseAdmin
        .from('jobs')
        .select('id, company_name, role_title')
        .eq('id', jobId)
        .single()

      if (!jobData) throw new Error(`Job ${jobId} not found`)

      const crunchbaseData = await fetchCrunchbase(jobData.company_name)
      if (crunchbaseData) await upsertCompanyProfile(jobId, crunchbaseData)

      await setProgress(
        researchJobId, 20,
        crunchbaseData
          ? `Found: ${crunchbaseData.employee_count_label ?? 'company profile'}`
          : 'Not in Crunchbase — continuing with other sources',
        'p1-discovery'
      )
      return { job: jobData, crunchbaseData }
    })

    // ── P2: Entity enrichment ─────────────────────────────────────────────
    const entityRows = await step.run('p2-entity-enrichment', async () => {
      await setProgress(researchJobId, 22, 'Finding key people…')

      const rawEntities = crunchbaseData?.founders?.length
        ? await enrichWithLinkedIn(crunchbaseData.founders, job.company_name)
        : await searchForFounders(job.company_name)

      await upsertEntities(jobId, rawEntities)

      const { data } = await supabaseAdmin
        .from('company_entities').select('id, name').eq('job_id', jobId)

      await setProgress(
        researchJobId, 38,
        `Found ${data?.length ?? 0} key people`,
        'p2-entity-enrichment'
      )
      return data ?? []
    })

    // ── P3: Research papers + patents ─────────────────────────────────────
    const research = await step.run('p3-research', async () => {
      await setProgress(researchJobId, 40, 'Searching research papers and patents…')

      const [papers, patents] = await Promise.all([
        fetchPapersForEntities(entityRows),
        fetchPatentsForEntities(entityRows, job.company_name),
      ])

      await Promise.all([
        papers.length  ? upsertPapers(jobId, papers)   : Promise.resolve(),
        patents.length ? upsertPatents(jobId, patents) : Promise.resolve(),
      ])

      await setProgress(
        researchJobId, 65,
        `Found ${papers.length} papers, ${patents.length} patents`,
        'p3-research'
      )
      return { papers, patents }
    })

    // ── P4: News refresh ──────────────────────────────────────────────────
    await step.run('p4-news', async () => {
      await setProgress(researchJobId, 67, 'Fetching latest news…')
      const newsItems = await fetchNewsInternal(job.company_name, job.role_title)
      await upsertNewsItems(newsItems, jobId)
      await setProgress(
        researchJobId, 80,
        `News refreshed (${newsItems.length} articles scanned)`,
        'p4-news'
      )
    })

    // ── P5: Claude synthesis ──────────────────────────────────────────────
    await step.run('p5-synthesis', async () => {
      const { papers, patents } = research
      if (!papers.length && !patents.length) {
        await setProgress(researchJobId, 100, 'Research complete (no papers/patents found)', 'p5-synthesis')
        return
      }
      await setProgress(researchJobId, 82, 'Scoring relevance with AI…')
      await claudeSynthesis(jobId, job, papers, patents)
      await setProgress(
        researchJobId, 100,
        `Scored ${papers.length + patents.length} items for relevance`,
        'p5-synthesis'
      )
    })

    // Final status update
    await supabaseAdmin.from('research_jobs').update({
      status: 'complete',
      completed_at: new Date().toISOString(),
    }).eq('id', researchJobId)
  }
)

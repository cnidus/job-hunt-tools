/**
 * research-agent.ts
 *
 * 5-phase Inngest research pipeline for a single job.
 *
 * P1  Company Intelligence  — SerpAPI KG + Wikipedia + organic snippets (Crunchbase optional)
 * P2  Entity Enrichment     — SerpAPI LinkedIn URL search per person
 * P3  Academic + Patents    — Semantic Scholar + SerpAPI Google Patents
 * P4  News Refresh          — SerpAPI Google News (reuses fetch-intel logic)
 * P5  Claude Synthesis      — Single Anthropic call scores + annotates papers/patents
 *
 * All phases write to Supabase via service-role client (bypasses RLS).
 * Checkpoints are stored in research_jobs.phases_complete[].
 */

import { inngest } from './client'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

// ─── Admin client (bypasses RLS) ─────────────────────────────────────────────

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL         ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY        ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
)

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? '',
})

// ─── Types ────────────────────────────────────────────────────────────────────

type EntityType = 'founder' | 'ceo' | 'cto' | 'vp' | 'investor' | 'advisor' | 'board'

interface CompanyIntelligenceResult {
  description:    string | null
  employee_count: string | null
  founded_year:   number | null
  hq_location:    string | null
  funding_total:  number | null  // USD millions
  funding_stage:  string | null
  ceo_name:       string | null
  ceo_linkedin:   string | null
  website:        string | null
  entities: Array<{
    name:        string
    role:        EntityType
    title:       string | null
    linkedin_url: string | null
    source:      string
  }>
  investors: Array<{
    name:       string
    stage:      string | null
    amount_usd: number | null
    source:     string
  }>
}

interface RawPaper {
  external_id:  string
  title:        string
  authors:      string[]
  abstract:     string | null
  year:         number | null
  venue:        string | null
  citation_count: number
  url:          string | null
  entity_name:  string
}

interface RawPatent {
  patent_id:    string | null
  title:        string
  inventors:    string[]
  assignee:     string | null
  filing_date:  string | null
  url:          string | null
  abstract:     string | null
  entity_name:  string
}

// ─── Material-event detection (exported for use in fetch-intel trigger) ────────

export function detectMaterialEvent(title: string, summary: string | null): boolean {
  const text = `${title} ${summary ?? ''}`.toLowerCase()
  return /\b(series [a-z]|seed round|raise[ds]?|funding|valuation|ipo|acqui|merger|ceo|chief executive|layoff|layoffs|cut[s]? \d+%)\b/.test(text)
}

// ─── P1: Multi-source company intelligence ────────────────────────────────────

export async function fetchCompanyIntelligence(
  companyName: string
): Promise<CompanyIntelligenceResult> {
  const result: CompanyIntelligenceResult = {
    description: null, employee_count: null, founded_year: null,
    hq_location: null, funding_total: null, funding_stage: null,
    ceo_name: null, ceo_linkedin: null, website: null,
    entities: [], investors: [],
  }

  const serpKey = process.env.SERP_API_KEY
  if (!serpKey) return result


  // Hoisted helpers — used across multiple try blocks below
  const strip = (s: string) =>
    s.replace(/\.[a-z]{2,}$/i, '')           // remove TLD (.io, .ai, .com)
     .replace(/\b(inc|corp|llc|ltd|co\.?)\b/gi, '')
     .replace(/\s+/g, ' ').trim().toLowerCase()
  const companyCore = strip(companyName)
  // ── 1a. SerpAPI Google search — Knowledge Graph + Related Questions ──────
  try {
    const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent('"' + companyName + '" company')}&api_key=${serpKey}`
    const res  = await fetch(url)
    if (res.ok) {
      const json = await res.json()

      // Knowledge Graph panel — use for factual company data only (not CEO/people).
      // KG validation: the KG title must CONTAIN the company core name (strip TLD + legal suffixes).
      // This prevents e.g. "Clockwork" KG (an IT firm) from poisoning "Clockwork Systems Inc" results,
      // because "clockwork" does NOT contain "clockwork systems".
      const kg = json.knowledge_graph
      const kgCore      = strip(kg?.title ?? kg?.name ?? '')
      // KG is valid only if its core title contains our full company core name
      const kgIsValid = kgCore.includes(companyCore)
      if (kg && kgIsValid) {
        result.description    = kg.description ?? result.description
        result.hq_location    = kg.headquarters ?? kg.location ?? result.hq_location
        result.website        = kg.website ?? result.website
        result.employee_count = kg.employees?.toString() ?? result.employee_count
        result.founded_year   = kg.founded ? parseInt(String(kg.founded)) : result.founded_year
        // NOTE: intentionally NOT extracting CEO/founders from KG — too unreliable for
        // small companies. CEO is sourced via dedicated organic search below.
      }

      // Related Questions — extract funding/founder/CEO facts from snippets
      for (const qa of json.related_questions ?? []) {
        const q: string = (qa.question ?? '').toLowerCase()
        const a: string = qa.snippet ?? qa.answer ?? ''
        if (!a) continue

        // Funding amount
        if (/funding|raise|valuation|worth/.test(q) && !result.funding_total) {
          const m = a.match(/\$\s*([\d.]+)\s*(billion|million|B|M)\b/i)
          if (m) {
            const n = parseFloat(m[1])
            result.funding_total = /billion|B/i.test(m[2]) ? n * 1000 : n
          }
        }

        // Founders (who founded / who started)
        if (/who (founded|started|created|built)/.test(q) && result.entities.filter(e => e.role === 'founder').length === 0) {
          // Try to extract names — look for "Name and Name founded..."
          const nameMatches = a.match(/([A-Z][a-z]+ [A-Z][a-z]+)/g) ?? []
          for (const name of nameMatches.slice(0, 3)) {
            if (!result.entities.find((e) => e.name === name)) {
              result.entities.push({ name, role: 'founder', title: 'Co-Founder', linkedin_url: null, source: 'serp_rq' })
            }
          }
        }

        // CEO (who is the ceo / who runs)
        if (/who (is|runs|leads|heads)/.test(q) && /ceo|chief executive|run/i.test(q) && !result.ceo_name) {
          const nameMatch = a.match(/^([A-Z][a-z]+ [A-Z][a-z]+)/)
          if (nameMatch) {
            result.ceo_name = nameMatch[1]
            if (!result.entities.find((e) => e.name === nameMatch[1])) {
              result.entities.push({ name: nameMatch[1], role: 'ceo', title: 'CEO', linkedin_url: null, source: 'serp_rq' })
            }
          }
        }

        // Founded year
        if (/when.*found|year.*found/.test(q) && !result.founded_year) {
          const yearMatch = a.match(/\b(19|20)\d{2}\b/)
          if (yearMatch) result.founded_year = parseInt(yearMatch[0])
        }

        // Funding stage
        if (/series|stage|round/.test(q) && !result.funding_stage) {
          const stageMatch = a.match(/\bSeries [A-Z]\b|\bSeed\b|\bIPO\b|\bPublic\b/i)
          if (stageMatch) result.funding_stage = stageMatch[0]
        }
      }

      // Organic results — scan first 3 snippets for employee count if not found yet
      if (!result.employee_count) {
        for (const organic of (json.organic_results ?? []).slice(0, 3)) {
          const snippet: string = organic.snippet ?? ''
          const m = snippet.match(/(\d[\d,]+)\s*(employees|staff|people)/i)
          if (m) {
            result.employee_count = m[1].replace(/,/g, '')
            break
          }
        }
      }
    }
  } catch (e) {
    console.error('fetchCompanyIntelligence:serp', e)
  }

  // ── 1a-ii. Dedicated CEO/founder search — avoids KG mis-attribution ──────
  // Run a targeted query so we get the ACTUAL leadership of this specific company.
  if (!result.ceo_name) {
    try {
      const ceoQuery = `"${companyName}" CEO OR founder`
      const ceoUrl = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(ceoQuery)}&num=5&api_key=${serpKey}`
      const ceoRes = await fetch(ceoUrl)
      if (ceoRes.ok) {
        const ceoJson = await ceoRes.json()
        // Try knowledge_graph people first (if a KG returns for this exact query)
        const ceoKg = ceoJson.knowledge_graph
        if (ceoKg?.title && strip(ceoKg.title).includes(companyCore)) {
          const ceoEntry = (ceoKg.profiles ?? []).find((p: { name?: string; title?: string }) =>
            /ceo|chief executive|founder/i.test(p.title ?? '')
          )
          if (ceoEntry?.name) {
            result.ceo_name = ceoEntry.name
            result.entities.push({ name: ceoEntry.name, role: 'ceo', title: ceoEntry.title ?? 'CEO', linkedin_url: null, source: 'serp_kg_ceo' })
          }
        }
        // Fallback: parse "Name is the CEO/founder of Company" patterns from snippets
        if (!result.ceo_name) {
          for (const org of (ceoJson.organic_results ?? []).slice(0, 5)) {
            const snippet: string = (org.snippet ?? org.title ?? '').replace(/\n/g, ' ')
            // Patterns: "Name is CEO" / "CEO Name" / "founded by Name"
            const patterns = [
              /([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)?)(?:\s+is|,)\s+(?:the\s+)?(?:CEO|Chief Executive|founder|co-founder)/i,
              /(?:CEO|Chief Executive|founder|co-founder)\s+(?:is\s+)?([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/i,
              /founded\s+by\s+([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/i,
            ]
            for (const pattern of patterns) {
              const m = snippet.match(pattern)
              if (m?.[1]) {
                const name = m[1].trim()
                // Sanity-check: name shouldn't be the company name itself
                if (!name.toLowerCase().includes(companyCore.split(' ')[0])) {
                  const role = /founder|co-founder/i.test(m[0]) ? 'founder' : 'ceo'
                  result.ceo_name = name
                  result.entities.push({ name, role, title: role === 'founder' ? 'Founder' : 'CEO', linkedin_url: null, source: 'serp_organic' })
                  break
                }
              }
            }
            if (result.ceo_name) break
          }
        }
      }
    } catch (e) {
      console.error('fetchCompanyIntelligence:serp_ceo', e)
    }
  }

  // ── 1b. Wikipedia REST API — description supplement ──────────────────────
  if (!result.description) {
    // Try multiple slugs: exact name, then name without TLD (e.g. "Clockwork.io" → "Clockwork")
    const wikiSlugs = [
      companyName.replace(/\s+/g, '_'),
      companyName.replace(/\.[a-z]{2,}$/i, '').replace(/\s+/g, '_'),
    ].filter((s, i, arr) => arr.indexOf(s) === i) // deduplicate

    for (const slug of wikiSlugs) {
      try {
        const res = await fetch(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(slug)}`,
          { headers: { 'User-Agent': 'JobTracker/1.0 (research tool)' } }
        )
        if (res.ok) {
          const wiki = await res.json()
          if (wiki.extract && wiki.type !== 'disambiguation') {
            result.description = wiki.extract.split('\n')[0]
            break
          }
        }
      } catch (e) {
        console.error(`fetchCompanyIntelligence:wiki(${slug})`, e)
      }
    }
  }

  // ── 1c. Optional Crunchbase (if API key configured) ───────────────────────
  if (process.env.CRUNCHBASE_API_KEY) {
    try {
      const cbKey = process.env.CRUNCHBASE_API_KEY
      const searchRes = await fetch(
        `https://api.crunchbase.com/api/v4/searches/organizations`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-cb-user-key': cbKey },
          body: JSON.stringify({
            field_ids: ['short_description','num_employees_enum','founded_on','location_identifiers',
                        'funding_total','last_funding_type','website_url'],
            query: [{ type: 'predicate', field_id: 'facet_ids', operator_id: 'includes', values: ['company'] },
                    { type: 'predicate', field_id: 'name', operator_id: 'eq', values: [companyName] }],
            limit: 1,
          }),
        }
      )
      if (searchRes.ok) {
        const cbData = await searchRes.json()
        const org = cbData.entities?.[0]?.properties
        if (org) {
          if (!result.description)    result.description    = org.short_description ?? null
          if (!result.employee_count) result.employee_count = org.num_employees_enum ?? null
          if (!result.hq_location && org.location_identifiers?.length)
            result.hq_location = org.location_identifiers[0].value
          if (!result.founded_year && org.founded_on?.value)
            result.founded_year = parseInt(org.founded_on.value.slice(0, 4))
          if (!result.funding_total && org.funding_total?.value_usd)
            result.funding_total = Math.round(org.funding_total.value_usd / 1_000_000)
          if (!result.funding_stage) result.funding_stage = org.last_funding_type ?? null
          if (!result.website)       result.website        = org.website_url ?? null
        }
      }
    } catch (e) {
      console.error('fetchCompanyIntelligence:crunchbase', e)
    }
  }

  return result
}

// ─── P2: Enrich entities with LinkedIn URLs via SerpAPI ───────────────────────

async function enrichEntitiesWithLinkedIn(
  entities: CompanyIntelligenceResult['entities'],
  companyName: string
): Promise<CompanyIntelligenceResult['entities']> {
  const serpKey = process.env.SERP_API_KEY
  if (!serpKey || entities.length === 0) return entities

  const enriched = [...entities]
  for (const entity of enriched) {
    if (entity.linkedin_url) continue
    try {
      const q = `site:linkedin.com/in "${entity.name}" "${companyName}"`
      const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(q)}&num=3&api_key=${serpKey}`
      const res = await fetch(url)
      if (!res.ok) continue
      const json = await res.json()
      const link = (json.organic_results ?? []).find(
        (r: { link?: string }) => r.link?.includes('linkedin.com/in/')
      )
      if (link?.link) entity.linkedin_url = link.link
      await new Promise((r) => setTimeout(r, 300))
    } catch (e) {
      console.error(`enrichEntitiesWithLinkedIn(${entity.name}):`, e)
    }
  }
  return enriched
}

// ─── P3a: Semantic Scholar papers ────────────────────────────────────────────

async function fetchPapersForEntities(
  entities: { name: string; role: EntityType }[]
): Promise<RawPaper[]> {
  const results: RawPaper[] = []
  const seenIds = new Set<string>()

  const targets = entities.filter((e) =>
    ['founder', 'ceo', 'cto'].includes(e.role)
  )

  for (const entity of targets) {
    try {
      // Search for author
      const authRes = await fetch(
        `https://api.semanticscholar.org/graph/v1/author/search?query=${encodeURIComponent(entity.name)}&fields=authorId,name&limit=1`
      )
      if (!authRes.ok) continue
      const authData = await authRes.json()
      const author = authData.data?.[0]
      if (!author?.authorId) continue

      // Fetch their papers
      const papRes = await fetch(
        `https://api.semanticscholar.org/graph/v1/author/${author.authorId}/papers?fields=paperId,title,abstract,year,venue,citationCount,externalIds,authors&limit=20`
      )
      if (!papRes.ok) continue
      const papData = await papRes.json()

      for (const paper of papData.data ?? []) {
        const id = `ss:${paper.paperId}`
        if (seenIds.has(id)) continue
        seenIds.add(id)

        results.push({
          external_id:   id,
          title:         paper.title ?? 'Untitled',
          authors:       (paper.authors ?? []).map((a: { name: string }) => a.name),
          abstract:      paper.abstract ?? null,
          year:          paper.year ?? null,
          venue:         paper.venue ?? null,
          citation_count: paper.citationCount ?? 0,
          url:           paper.externalIds?.DOI
            ? `https://doi.org/${paper.externalIds.DOI}`
            : null,
          entity_name: entity.name,
        })
      }
      await new Promise((r) => setTimeout(r, 400))
    } catch (e) {
      console.error(`fetchPapersForEntities(${entity.name}):`, e)
    }
  }
  return results
}

// ─── P3b: SerpAPI Google Patents ──────────────────────────────────────────────

async function fetchPatentsForEntities(
  entities: { name: string; role: EntityType }[],
  companyName: string
): Promise<RawPatent[]> {
  const serpKey = process.env.SERP_API_KEY
  if (!serpKey) return []

  const results: RawPatent[] = []
  const seenIds = new Set<string>()

  const targets = entities
    .filter((e) => ['founder', 'ceo', 'cto'].includes(e.role))
    .slice(0, 5)

  for (const entity of targets) {
    try {
      const q = `inventor:"${entity.name}" OR assignee:"${companyName}"`
      const url = `https://serpapi.com/search.json?engine=google_patents&q=${encodeURIComponent(q)}&api_key=${serpKey}`
      const res = await fetch(url)
      if (!res.ok) continue
      const json = await res.json()

      for (const patent of (json.organic_results ?? []).slice(0, 10)) {
        const patentId = patent.patent_id ?? patent.publication_number ?? null
        const dedup = patentId ?? `title:${(patent.title ?? '').toLowerCase().slice(0, 60)}`
        if (seenIds.has(dedup)) continue
        seenIds.add(dedup)

        results.push({
          patent_id:   patentId,
          title:       patent.title ?? 'Untitled',
          inventors:   patent.inventor ? [patent.inventor] : [],
          assignee:    patent.assignee ?? companyName,
          filing_date: patent.filing_date ?? null,
          url:         patent.link ?? null,
          abstract:    patent.snippet ?? null,
          entity_name: entity.name,
        })
      }
      await new Promise((r) => setTimeout(r, 300))
    } catch (e) {
      console.error(`fetchPatentsForEntities(${entity.name}):`, e)
    }
  }
  return results
}

// ─── P4: News (reuses logic from fetch-intel route) ──────────────────────────

async function fetchNewsInternal(
  companyName: string,
  roleTitle: string
): Promise<Array<{
  source: string; item_type: string; title: string; url: string | null
  summary: string | null; published_at: string; tags: string[]
}>> {
  const serpKey = process.env.SERP_API_KEY
  if (!serpKey) return []

  const queries = [
    `"${companyName}"`,
    `"${companyName}" ${roleTitle}`,
    `"${companyName}" funding`,
    `"${companyName}" product launch`,
  ]

  const results: Array<{
    source: string; item_type: string; title: string; url: string | null
    summary: string | null; published_at: string; tags: string[]
  }> = []
  const seenUrls = new Set<string>()

  for (const q of queries) {
    try {
      const url = `https://serpapi.com/search.json?engine=google_news&q=${encodeURIComponent(q)}&api_key=${serpKey}`
      const res  = await fetch(url)
      if (!res.ok) continue
      const json = await res.json()

      for (const article of json.news_results ?? []) {
        const articleUrl = article.link ?? null
        if (articleUrl && seenUrls.has(articleUrl)) continue
        if (articleUrl) seenUrls.add(articleUrl)

        results.push({
          source:       'news',
          item_type:    'article',
          title:        article.title ?? 'Untitled',
          url:          articleUrl,
          summary:      article.snippet ?? null,
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

// ─── P5: Claude synthesis — score + annotate papers & patents ────────────────

async function claudeSynthesis(
  jobId: string,
  job: { company_name: string; role_title: string },
  papers: RawPaper[],
  patents: RawPatent[]
): Promise<void> {
  if (papers.length === 0 && patents.length === 0) return

  // Cap at 30 items to control cost (~$0.08–0.15 per run)
  const items = [
    ...papers.map((p) => ({ kind: 'paper' as const, id: p.external_id, title: p.title, abstract: p.abstract, year: p.year, authors: p.authors })),
    ...patents.map((p) => ({ kind: 'patent' as const, id: p.patent_id ?? p.title.slice(0, 40), title: p.title, abstract: p.abstract, year: null, authors: p.inventors })),
  ].slice(0, 30)

  const prompt = `You are evaluating research papers and patents for a job candidate interviewing for a ${job.role_title} role at ${job.company_name}.

For each item below, return a JSON array with one object per item containing:
- "id": the item's id
- "relevance_category": one of "core_to_company" | "relevant_to_role" | "tangential" | "not_relevant"
- "relevance_score": float 0.0–1.0 (1.0 = highly relevant to both company domain and role)
- "relevance_note": 1–2 sentences describing WHY it's relevant and what interview angle it creates

Items:
${JSON.stringify(items, null, 2)}

Return ONLY a valid JSON array, no markdown, no extra text.`

  try {
    const message = await anthropic.messages.create({
      model:      'claude-3-5-haiku-20241022',
      max_tokens: 2048,
      messages:   [{ role: 'user', content: prompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const parsed: Array<{
      id: string
      relevance_category: string
      relevance_score: number
      relevance_note: string
    }> = JSON.parse(text)

    // Update papers
    for (const rating of parsed) {
      await supabaseAdmin
        .from('research_papers')
        .update({
          relevance_category: rating.relevance_category,
          relevance_score:    rating.relevance_score,
          relevance_note:     rating.relevance_note,
        })
        .eq('job_id', jobId)
        .eq('external_id', rating.id)

      // Also try patents
      await supabaseAdmin
        .from('patents')
        .update({
          relevance_category: rating.relevance_category,
          relevance_score:    rating.relevance_score,
          relevance_note:     rating.relevance_note,
        })
        .eq('job_id', jobId)
        .eq('patent_id', rating.id)
    }
  } catch (e) {
    console.error('claudeSynthesis:', e)
  }
}

// ─── Helpers: Supabase writes ─────────────────────────────────────────────────

async function saveCompanyProfile(
  jobId: string,
  intel: CompanyIntelligenceResult
): Promise<void> {
  const existing = await supabaseAdmin
    .from('company_profiles')
    .select('id')
    .eq('job_id', jobId)
    .maybeSingle()

  const payload = {
    job_id:         jobId,
    description:    intel.description,
    employee_count: intel.employee_count,
    founded_year:   intel.founded_year,
    hq_location:    intel.hq_location,
    funding_total:  intel.funding_total,
    funding_stage:  intel.funding_stage,
    ceo_name:       intel.ceo_name,
    ceo_linkedin:   intel.ceo_linkedin,
    website:        intel.website,
    updated_at:     new Date().toISOString(),
  }

  if (existing.data) {
    await supabaseAdmin.from('company_profiles').update(payload).eq('job_id', jobId)
  } else {
    await supabaseAdmin.from('company_profiles').insert(payload)
  }
}

async function saveEntities(
  jobId: string,
  entities: CompanyIntelligenceResult['entities']
): Promise<void> {
  for (const entity of entities) {
    const dedup = `${jobId}:${entity.name.toLowerCase()}`
    await supabaseAdmin
      .from('company_entities')
      .upsert(
        { job_id: jobId, ...entity, dedup_key: dedup },
        { onConflict: 'dedup_key' }
      )
  }
}

async function saveInvestors(
  jobId: string,
  investors: CompanyIntelligenceResult['investors']
): Promise<void> {
  for (const inv of investors) {
    const dedup = `${jobId}:${inv.name.toLowerCase()}`
    await supabaseAdmin
      .from('company_investors')
      .upsert(
        { job_id: jobId, ...inv, dedup_key: dedup },
        { onConflict: 'dedup_key' }
      )
  }
}

async function savePapers(jobId: string, papers: RawPaper[]): Promise<void> {
  for (const paper of papers) {
    const dedup = paper.external_id
    await supabaseAdmin
      .from('research_papers')
      .upsert(
        { job_id: jobId, ...paper, dedup_key: dedup },
        { onConflict: 'dedup_key' }
      )
  }
}

async function savePatents(jobId: string, patents: RawPatent[]): Promise<void> {
  for (const patent of patents) {
    const dedup = patent.patent_id
      ? `patent:${patent.patent_id}`
      : `title:${patent.title.toLowerCase().slice(0, 60)}`
    await supabaseAdmin
      .from('patents')
      .upsert(
        { job_id: jobId, ...patent, dedup_key: dedup },
        { onConflict: 'dedup_key' }
      )
  }
}

async function upsertNewsItems(
  items: Awaited<ReturnType<typeof fetchNewsInternal>>,
  jobId: string
): Promise<number> {
  if (!items.length) return 0

  const urls = items.map((i) => i.url).filter(Boolean)
  const { data: existing } = await supabaseAdmin
    .from('intel_items')
    .select('url')
    .eq('job_id', jobId)
    .in('url', urls)

  const existingUrls = new Set((existing ?? []).map((r: { url: string }) => r.url))
  const newItems = items
    .filter((i) => i.url && !existingUrls.has(i.url))
    .map((i) => ({ ...i, job_id: jobId }))

  if (!newItems.length) return 0
  const { error } = await supabaseAdmin.from('intel_items').insert(newItems)
  if (error) { console.error('upsertNewsItems:', error); return 0 }
  return newItems.length
}

async function markPhaseComplete(researchJobId: string, phase: string): Promise<void> {
  await supabaseAdmin.rpc('append_phase_complete', {
    p_research_job_id: researchJobId,
    p_phase:           phase,
  })
}

async function failResearchJob(researchJobId: string, error: string): Promise<void> {
  await supabaseAdmin
    .from('research_jobs')
    .update({ status: 'failed', error_message: error, updated_at: new Date().toISOString() })
    .eq('id', researchJobId)
}

// ─── Main Inngest function ────────────────────────────────────────────────────

export const researchAgent = inngest.createFunction(
  {
    id:      'research-agent',
    retries: 2,
    onFailure: async ({ event, error }) => {
      const originalData = (event.data as unknown as { event?: { data?: { researchJobId?: string } } }).event?.data
      const researchJobId = originalData?.researchJobId
      if (researchJobId) {
        await failResearchJob(researchJobId, String(error))
      }
    },
  },
  { event: 'research/job.created' },
  async ({ event, step }) => {
    const { jobId, researchJobId } = event.data as { jobId: string; researchJobId: string }

    // Load job metadata
    const { data: job } = await supabaseAdmin
      .from('jobs')
      .select('company_name, role_title')
      .eq('id', jobId)
      .single()

    if (!job) throw new Error(`Job ${jobId} not found`)

    // Mark running
    await supabaseAdmin
      .from('research_jobs')
      .update({ status: 'running', updated_at: new Date().toISOString() })
      .eq('id', researchJobId)

    // ── Phase 1: Company intelligence ───────────────────────────────────────
    const intel = await step.run('p1-company-intelligence', async () => {
      const result = await fetchCompanyIntelligence(job.company_name)
      await saveCompanyProfile(jobId, result)
      await saveInvestors(jobId, result.investors)
      await markPhaseComplete(researchJobId, 'p1_company')
      return result
    })

    // ── Phase 2: Entity enrichment (LinkedIn URLs) ──────────────────────────
    const enrichedEntities = await step.run('p2-entity-enrichment', async () => {
      const entities = await enrichEntitiesWithLinkedIn(intel.entities, job.company_name)
      await saveEntities(jobId, entities)
      await markPhaseComplete(researchJobId, 'p2_entities')
      return entities
    })

    // ── Phase 3: Papers + patents ───────────────────────────────────────────
    const { papers, patents } = await step.run('p3-research', async () => {
      const [rawPapers, rawPatents] = await Promise.all([
        fetchPapersForEntities(enrichedEntities),
        fetchPatentsForEntities(enrichedEntities, job.company_name),
      ])
      await savePapers(jobId, rawPapers)
      await savePatents(jobId, rawPatents)
      await markPhaseComplete(researchJobId, 'p3_research')
      return { papers: rawPapers, patents: rawPatents }
    })

    // ── Phase 4: News refresh ───────────────────────────────────────────────
    await step.run('p4-news', async () => {
      const newsItems = await fetchNewsInternal(job.company_name, job.role_title)
      const inserted  = await upsertNewsItems(newsItems, jobId)
      await markPhaseComplete(researchJobId, 'p4_news')
      return { fetched: newsItems.length, inserted }
    })

    // ── Phase 5: Claude synthesis ───────────────────────────────────────────
    await step.run('p5-synthesis', async () => {
      await claudeSynthesis(jobId, job, papers, patents)
      await markPhaseComplete(researchJobId, 'p5_synthesis')
    })


    // ── Phase 6: Gap analysis (user profile vs job) ─────────────────────────
    await step.run('p6-gap-analysis', async () => {
      const { data: jobRow } = await supabaseAdmin
        .from('jobs')
        .select('user_id, notes')
        .eq('id', jobId)
        .single()

      if (jobRow?.user_id) {
        const { data: cp } = await supabaseAdmin
          .from('company_profiles')
          .select('description')
          .eq('job_id', jobId)
          .maybeSingle()

        await runGapAnalysis(
          researchJobId,
          { ...job, notes: jobRow.notes },
          jobRow.user_id,
          cp?.description ?? null
        )
      }
      await markPhaseComplete(researchJobId, 'p6_gap_analysis')
    })
    // Mark complete
    await supabaseAdmin
      .from('research_jobs')
      .update({
        status:     'complete',
        updated_at: new Date().toISOString(),
      })
      .eq('id', researchJobId)

    return { ok: true, jobId, researchJobId }
  }
)

// ─── P6: Gap analysis — user profile vs job requirements ─────────────────────

async function runGapAnalysis(
  researchJobId: string,
  job: { company_name: string; role_title: string; notes?: string | null },
  userId: string,
  companyDescription: string | null
): Promise<void> {
  // Load user profile
  const { data: userProfile } = await supabaseAdmin
    .from('user_profiles')
    .select('resume_text, parsed_profile')
    .eq('user_id', userId)
    .maybeSingle()

  if (!userProfile?.resume_text) {
    // No profile yet — skip silently, gap_analysis stays null
    console.log('runGapAnalysis: no user profile found, skipping')
    return
  }

  const jdContext = [
    `Role: ${job.role_title} at ${job.company_name}`,
    companyDescription ? `Company: ${companyDescription}` : null,
    job.notes ? `Job description / notes:\n${job.notes}` : null,
  ].filter(Boolean).join('\n\n')

  const prompt = `You are a career coach and technical interviewer. Analyse the candidate's profile against the job and produce a gap analysis JSON.

=== JOB ===
${jdContext}

=== CANDIDATE PROFILE ===
${userProfile.resume_text}

=== INSTRUCTIONS ===
Return ONLY valid JSON (no markdown, no explanation) matching this exact schema:
{
  "match_score": <integer 0-100 — overall fit>,
  "skill_radar": [
    { "skill": <string>, "user_level": <0-5>, "required_level": <0-5> }
  ],
  "study_topics": [
    {
      "topic": <string>,
      "priority": <"high"|"medium"|"low">,
      "reason": <one sentence why this matters for the role>,
      "resources": [<up to 3 suggested resource titles / search queries>]
    }
  ],
  "strengths": [
    { "area": <string>, "detail": <one-two sentences how this gives the candidate an edge> }
  ],
  "talking_points": [
    {
      "requirement": <key job requirement>,
      "talking_point": <how the candidate addresses it>,
      "evidence": <specific past role / project / patent / paper to cite>
    }
  ],
  "generated_at": "${new Date().toISOString()}"
}

Rules:
- skill_radar: list the 8-12 most relevant skills for this role. Score user_level 0=none, 5=expert.
- study_topics: rank by gap size × role importance. Include only topics worth the candidate's time.
- strengths: highlight patents, niche experience, or domain expertise that distinguishes the candidate.
- talking_points: map each major JD requirement to the candidate's best evidence. Be specific.
- If the candidate profile lacks detail for a section, make a conservative estimate and flag it.`

  const response = await anthropic.messages.create({
    model:      'claude-opus-4-6',
    max_tokens: 4096,
    messages:   [{ role: 'user', content: prompt }],
  })

  const rawText = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

  let gapAnalysis: Record<string, unknown>
  try {
    const cleaned = rawText.replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim()
    gapAnalysis = JSON.parse(cleaned)
  } catch {
    console.error('runGapAnalysis: Claude returned non-JSON', rawText.slice(0, 300))
    return
  }

  await supabaseAdmin
    .from('research_jobs')
    .update({ gap_analysis: gapAnalysis, updated_at: new Date().toISOString() })
    .eq('id', researchJobId)
}

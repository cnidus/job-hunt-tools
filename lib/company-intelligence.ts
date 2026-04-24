/**
 * lib/company-intelligence.ts
 *
 * Standalone company intelligence fetcher — no Inngest, Supabase, or Anthropic
 * dependencies so it can be imported by scripts (dq-canary, etc.) without the
 * full server stack.
 */

export type EntityType = 'founder' | 'ceo' | 'cto' | 'vp' | 'investor' | 'advisor' | 'board'

export interface CompanyIntelligenceResult {
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
    name:         string
    role:         EntityType
    title:        string | null
    linkedin_url: string | null
    source:       string
  }>
  investors: Array<{
    name:       string
    stage:      string | null
    amount_usd: number | null
    source:     string
  }>
}

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
    s.replace(/\.[a-z]{2,}$/i, '')
     .replace(/\b(inc|corp|llc|ltd|co\.?)\b/gi, '')
     .replace(/\s+/g, ' ').trim().toLowerCase()
  const companyCore = strip(companyName)

  // ── 1a. SerpAPI Google search — Knowledge Graph + Related Questions ──────
  try {
    const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent('"' + companyName + '" company')}&api_key=${serpKey}`
    const res = await fetch(url)
    if (res.ok) {
      const json = await res.json()

      const kg = json.knowledge_graph
      const kgCore    = strip(kg?.title ?? kg?.name ?? '')
      const kgIsValid = kgCore.includes(companyCore)
      if (kg && kgIsValid) {
        result.description    = kg.description ?? result.description
        result.hq_location    = kg.headquarters ?? kg.location ?? result.hq_location
        result.website        = kg.website ?? result.website
        result.employee_count = kg.employees?.toString() ?? result.employee_count
        result.founded_year   = kg.founded ? parseInt(String(kg.founded)) : result.founded_year
      }

      for (const qa of json.related_questions ?? []) {
        const q: string = (qa.question ?? '').toLowerCase()
        const a: string = qa.snippet ?? qa.answer ?? ''
        if (!a) continue

        if (/funding|raise|valuation|worth/.test(q) && !result.funding_total) {
          const m = a.match(/\$\s*([\d.]+)\s*(billion|million|B|M)\b/i)
          if (m) {
            const n = parseFloat(m[1])
            result.funding_total = /billion|B/i.test(m[2]) ? n * 1000 : n
          }
        }
        if (/who (founded|started|created|built)/.test(q) && result.entities.filter(e => e.role === 'founder').length === 0) {
          const nameMatches = a.match(/([A-Z][a-z]+ [A-Z][a-z]+)/g) ?? []
          for (const name of nameMatches.slice(0, 3)) {
            if (!result.entities.find((e) => e.name === name))
              result.entities.push({ name, role: 'founder', title: 'Co-Founder', linkedin_url: null, source: 'serp_rq' })
          }
        }
        if (/who (is|runs|leads|heads)/.test(q) && /ceo|chief executive|run/i.test(q) && !result.ceo_name) {
          const nameMatch = a.match(/^([A-Z][a-z]+ [A-Z][a-z]+)/)
          if (nameMatch) {
            result.ceo_name = nameMatch[1]
            if (!result.entities.find((e) => e.name === nameMatch[1]))
              result.entities.push({ name: nameMatch[1], role: 'ceo', title: 'CEO', linkedin_url: null, source: 'serp_rq' })
          }
        }
        if (/when.*found|year.*found/.test(q) && !result.founded_year) {
          const yearMatch = a.match(/\b(19|20)\d{2}\b/)
          if (yearMatch) result.founded_year = parseInt(yearMatch[0])
        }
        if (/series|stage|round/.test(q) && !result.funding_stage) {
          const stageMatch = a.match(/\bSeries [A-Z]\b|\bSeed\b|\bIPO\b|\bPublic\b/i)
          if (stageMatch) result.funding_stage = stageMatch[0]
        }
      }

      if (!result.employee_count) {
        for (const organic of (json.organic_results ?? []).slice(0, 3)) {
          const snippet: string = organic.snippet ?? ''
          const m = snippet.match(/(\d[\d,]+)\s*(employees|staff|people)/i)
          if (m) { result.employee_count = m[1].replace(/,/g, ''); break }
        }
      }

      // Extract company website from organic results when KG doesn't provide it
      if (!result.website) {
        const skipDomains = ['crunchbase','linkedin','bloomberg','wikipedia','techcrunch',
                             'venturebeat','forbes','google','twitter','youtube','facebook',
                             'bing','yahoo','glassdoor','pitchbook','zoominfo','apollo']
        for (const organic of (json.organic_results ?? []).slice(0, 5)) {
          const link: string = organic.link ?? ''
          if (!link.startsWith('http')) continue
          const isThirdParty = skipDomains.some((d) => link.toLowerCase().includes(d))
          if (!isThirdParty) {
            try {
              const u = new URL(link)
              result.website = `${u.protocol}//${u.hostname}`
              break
            } catch { /* skip */ }
          }
        }
      }
    }
  } catch (e) {
    console.error('fetchCompanyIntelligence:serp', e)
  }

  // ── Shared helpers (used by all people-extraction phases below) ─────────────
  const NAME = '[A-Z][a-z]+(?:\\s[A-Z][a-z]+)+'
  const STOPWORDS = new Set(['and','of','the','said','by','is','was','in','at','for',
                             'from','with','to','a','an','as','or','on','its','their'])
  const isValidName = (name: string): boolean => {
    const parts = name.trim().split(/\s+/)
    if (parts.length < 2 || parts.length > 3) return false
    if (!parts.every((p) => /^[A-Z][a-z]{1,}$/.test(p))) return false
    if (parts.some((p) => STOPWORDS.has(p.toLowerCase()))) return false
    return true
  }
  const addEntity = (name: string, role: 'ceo'|'cto'|'founder'|'vp', titleStr: string|null, src: string) => {
    const n = name.trim()
    if (!isValidName(n)) return
    if (n.toLowerCase().includes(companyCore.split(' ')[0])) return
    if (result.entities.find((e) => e.name.toLowerCase() === n.toLowerCase())) return
    result.entities.push({ name: n, role, title: titleStr, linkedin_url: null, source: src })
    if (role === 'ceo' && !result.ceo_name) result.ceo_name = n
  }
  const extractPeopleFromText = (text: string, src: string) => {
    const coFoundedBy = new RegExp(`co-?founded\\s+by\\s+(${NAME})(?:,\\s*(${NAME}))?(?:,?\\s+and\\s+(${NAME}))?`, 'gi')
    for (const m of text.matchAll(coFoundedBy)) {
      [m[1], m[2], m[3]].filter(Boolean).forEach((n) => addEntity(n!, 'founder', 'Co-Founder', src))
    }
    const coFounders = new RegExp(`co-?founders?[:\\s]+(${NAME})(?:[,\\s]+(?:and\\s+)?(${NAME}))?(?:[,\\s]+(?:and\\s+)?(${NAME}))?`, 'gi')
    for (const m of text.matchAll(coFounders)) {
      [m[1], m[2], m[3]].filter(Boolean).forEach((n) => addEntity(n!, 'founder', 'Co-Founder', src))
    }
    const foundedBy = new RegExp(`(?<!co-)founded\\s+by\\s+(${NAME})(?:\\s+and\\s+(${NAME}))?`, 'gi')
    for (const m of text.matchAll(foundedBy)) {
      [m[1], m[2]].filter(Boolean).forEach((n) => addEntity(n!, 'founder', 'Founder', src))
    }
    const ceoIs = new RegExp(`(${NAME})(?:\\s+is|,)\\s+(?:the\\s+)?(?:CEO|Chief Executive Officer)`, 'gi')
    for (const m of text.matchAll(ceoIs)) if (m[1]) addEntity(m[1], 'ceo', 'CEO', src)
    const ceoPre = new RegExp(`(?:CEO|Chief Executive Officer)\\s+(?:is\\s+)?(${NAME})`, 'gi')
    for (const m of text.matchAll(ceoPre)) if (m[1]) addEntity(m[1], 'ceo', 'CEO', src)
    const ctoIs = new RegExp(`(${NAME})(?:\\s+is|,)\\s+(?:the\\s+)?(?:CTO|Chief Technology Officer)`, 'gi')
    for (const m of text.matchAll(ctoIs)) if (m[1]) addEntity(m[1], 'cto', 'CTO', src)

    // "Name - Co-Founder at Company" or "Name | CEO, Company" — common in LinkedIn snippets
    const linkedinCard = new RegExp(
      `(${NAME})\\s*[-–|]\\s*(Co-?Founder|CEO|CTO|COO|CFO|Chief[^,\\.·]{0,30})(?:\\s+at\\s+|\\s*[,·]\\s*|\\s+@\\s+)`,
      'gi'
    )
    for (const m of text.matchAll(linkedinCard)) {
      if (!m[1] || !m[2]) continue
      const t = m[2].trim()
      const role: 'ceo'|'cto'|'founder'|'vp' =
        /cto|chief tech/i.test(t) ? 'cto' : /ceo|chief exec/i.test(t) ? 'ceo' :
        /founder/i.test(t) ? 'founder' : 'vp'
      addEntity(m[1], role, t, src)
    }

    // "Name, Co-Founder and CTO" — profile card pattern
    const profileCard = new RegExp(
      `(${NAME}),\\s*(Co-?Founder(?:\\s+(?:and|&)\\s+(?:CEO|CTO|COO|CFO|Chief[^,\\.]{0,30}))?|CEO|CTO|COO|CFO)`,
      'gi'
    )
    for (const m of text.matchAll(profileCard)) {
      if (!m[1] || !m[2]) continue
      const t = m[2].trim()
      const role: 'ceo'|'cto'|'founder'|'vp' =
        /cto|chief tech/i.test(t) ? 'cto' : /ceo|chief exec/i.test(t) ? 'ceo' :
        /founder/i.test(t) ? 'founder' : 'vp'
      addEntity(m[1], role, t, src)
    }
  }
  const htmlToText = (html: string) =>
    html.replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ').trim()

  // ── 1a-ii. Leadership team search (always runs, finds multiple people) ──────
  for (const q of [`"${companyName}" co-founders leadership`, `"${companyName}" CEO founder`]) {
      try {
        const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(q)}&num=8&api_key=${serpKey}`
        const res = await fetch(url)
        if (!res.ok) continue
        const json = await res.json()

        const kg = json.knowledge_graph
        if (kg?.title && strip(kg.title).includes(companyCore)) {
          for (const p of kg.profiles ?? []) {
            const t: string = p.title ?? ''
            const role: 'ceo' | 'cto' | 'founder' | 'vp' =
              /cto|chief tech/i.test(t) ? 'cto' : /ceo|chief exec/i.test(t) ? 'ceo' :
              /founder/i.test(t) ? 'founder' : 'vp'
            if (p.name) addEntity(p.name, role, t || null, 'serp_kg_team')
          }
        }
        for (const item of (json.organic_results ?? []).slice(0, 8)) {
          extractPeopleFromText([item.snippet, item.title].filter(Boolean).join(' ').replace(/\n/g, ' '), 'serp_team')
        }
        for (const qa of json.related_questions ?? []) {
          extractPeopleFromText([qa.snippet, qa.answer, qa.question].filter(Boolean).join(' '), 'serp_rq_team')
        }
      } catch (e) {
        console.error(`fetchCompanyIntelligence:serp_team(${q}):`, e)
      }
    }

  // ── 1b. Wikipedia REST API — description supplement ──────────────────────
  if (!result.description) {
    const wikiSlugs = [
      companyName.replace(/\s+/g, '_'),
      companyName.replace(/\.[a-z]{2,}$/i, '').replace(/\s+/g, '_'),
    ].filter((s, i, arr) => arr.indexOf(s) === i)

    for (const slug of wikiSlugs) {
      try {
        const res = await fetch(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(slug)}`,
          { headers: { 'User-Agent': 'JobTracker/1.0 (research tool)' } }
        )
        if (res.ok) {
          const wiki = await res.json()
          if (wiki.extract && wiki.type !== 'disambiguation') { result.description = wiki.extract.split('\n')[0]; break }
        }
      } catch (e) {
        console.error(`fetchCompanyIntelligence:wiki(${slug})`, e)
      }
    }
  }

  // ── 1c. Optional Crunchbase ───────────────────────────────────────────────
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

  // ── 1c-ii. Nubela / NinjaPear — company details + funding ───────────────
  // company/details returns executives[]{name, title} — most reliable people source.
  // company/funding returns investors + total raised.
  // Both cost credits; skip gracefully if key absent or balance too low.
  if (process.env.NUBELA_API_KEY) {
    const nubelaKey = process.env.NUBELA_API_KEY
    // Strip protocol — Nubela accepts bare hostname
    const nubelaHost = (result.website ?? '').replace(/^https?:\/\//, '').replace(/\/$/, '')

    if (nubelaHost) {
      // Company details (includes executives)
      try {
        const detRes = await fetch(
          `https://nubela.co/api/v1/company/details?website=${encodeURIComponent(nubelaHost)}`,
          { headers: { Authorization: `Bearer ${nubelaKey}` } }
        )
        if (detRes.ok) {
          const det = await detRes.json()
          if (!det.error) {
            if (!result.description    && det.tagline)          result.description    = det.tagline
            if (!result.founded_year   && det.founded_year)     result.founded_year   = det.founded_year
            if (!result.employee_count && det.employee_count)   result.employee_count = String(det.employee_count)
            if (!result.hq_location    && det.addresses?.length) {
              const addr = det.addresses[0]
              result.hq_location = [addr.city, addr.state, addr.country].filter(Boolean).join(', ')
            }
            for (const exec of (det.executives ?? [])) {
              if (!exec.name) continue
              const t: string = exec.title ?? ''
              const role: 'ceo'|'cto'|'founder'|'vp' =
                /cto|chief tech/i.test(t)  ? 'cto'     :
                /ceo|chief exec/i.test(t)  ? 'ceo'     :
                /founder/i.test(t)         ? 'founder'  : 'vp'
              addEntity(exec.name, role, t || null, 'nubela_details')
            }
          }
        }
      } catch (e) {
        console.error('fetchCompanyIntelligence:nubela_details', e)
      }

      // Funding rounds
      try {
        const funRes = await fetch(
          `https://nubela.co/api/v1/company/funding?website=${encodeURIComponent(nubelaHost)}`,
          { headers: { Authorization: `Bearer ${nubelaKey}` } }
        )
        if (funRes.ok) {
          const fun = await funRes.json()
          if (!fun.error && fun.funding_rounds?.length) {
            if (!result.funding_total && fun.total_funds_raised_usd)
              result.funding_total = Math.round(fun.total_funds_raised_usd / 1_000_000)
            const latest = fun.funding_rounds[0]
            if (!result.funding_stage && latest?.round_type)
              result.funding_stage = latest.round_type.replace(/_/g, ' ')
            for (const round of fun.funding_rounds) {
              for (const inv of (round.investors ?? [])) {
                if (!inv.name) continue
                if (!result.investors.find((i) => i.name === inv.name)) {
                  result.investors.push({
                    name: inv.name,
                    stage: round.round_type?.replace(/_/g, ' ') ?? null,
                    amount_usd: round.amount_usd ? Math.round(round.amount_usd / 1_000_000) : null,
                    source: 'nubela_funding',
                  })
                }
              }
            }
          }
        }
      } catch (e) {
        console.error('fetchCompanyIntelligence:nubela_funding', e)
      }
    }
  }

  // ── 1d. SerpAPI site-specific search for team/about pages ───────────────
  // Direct HTTP fetches of company websites often fail (JS SPAs, bot blocking).
  // Instead, query Google via SerpAPI with site: restriction — Google's crawler
  // has already rendered and indexed JS-rendered pages.
  if (result.website) {
    try {
      const hostname = new URL(result.website).hostname
      const siteQ = `site:${hostname} team OR about OR leadership`
      const siteRes = await fetch(
        `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(siteQ)}&num=5&api_key=${serpKey}`
      )
      if (siteRes.ok) {
        const siteJson = await siteRes.json()
        for (const item of (siteJson.organic_results ?? []).slice(0, 5)) {
          extractPeopleFromText([item.title, item.snippet].filter(Boolean).join(' · '), 'serp_site_team')
        }
      }
    } catch (e) {
      console.error('fetchCompanyIntelligence:serp_site_team', e)
    }
  }

  // ── 1e. SerpAPI news/funding snippets — no page fetch needed ────────────
  // Funding announcements name all co-founders. We use SerpAPI snippets directly
  // rather than fetching the full article pages (which are blocked by paywalls/bots).
  for (const newsQ of [
    `"${companyName}" co-founders funding`,
    `"${companyName}" founder CEO CTO`,
  ]) {
    try {
      const newsRes = await fetch(
        `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(newsQ)}&num=8&api_key=${serpKey}`
      )
      if (!newsRes.ok) continue
      const newsJson = await newsRes.json()
      for (const item of (newsJson.organic_results ?? []).slice(0, 8)) {
        extractPeopleFromText([item.title, item.snippet].filter(Boolean).join(' · '), 'serp_news')
      }
      for (const qa of newsJson.related_questions ?? []) {
        extractPeopleFromText([qa.question, qa.snippet, qa.answer].filter(Boolean).join(' '), 'serp_news_rq')
      }
      // Also check KG returned by this query
      const kg2 = newsJson.knowledge_graph
      if (kg2?.title && strip(kg2.title).includes(companyCore)) {
        for (const p of kg2.profiles ?? []) {
          const t: string = p.title ?? ''
          const role: 'ceo'|'cto'|'founder'|'vp' =
            /cto|chief tech/i.test(t) ? 'cto' : /ceo|chief exec/i.test(t) ? 'ceo' :
            /founder/i.test(t) ? 'founder' : 'vp'
          if (p.name) addEntity(p.name, role, t || null, 'serp_kg2')
        }
      }
    } catch (e) {
      console.error(`fetchCompanyIntelligence:serp_news(${newsQ}):`, e)
    }
  }

  // ── 1f. LinkedIn people search via SerpAPI ───────────────────────────────
  // LinkedIn profiles often have "Name - Co-Founder at Company" in the title/snippet.
  // SerpAPI can search site:linkedin.com/in without triggering LinkedIn's bot blocking.
  try {
    const liQ = `site:linkedin.com/in "${companyName}" co-founder OR founder OR CEO OR CTO`
    const liRes = await fetch(
      `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(liQ)}&num=8&api_key=${serpKey}`
    )
    if (liRes.ok) {
      const liJson = await liRes.json()
      for (const item of (liJson.organic_results ?? []).slice(0, 8)) {
        extractPeopleFromText([item.title, item.snippet].filter(Boolean).join(' · '), 'serp_linkedin')
      }
    }
  } catch (e) {
    console.error('fetchCompanyIntelligence:serp_linkedin', e)
  }

  return result
}

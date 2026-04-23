/**
 * /api/fetch-intel?job_id=<uuid>
 *
 * Fetches news for a specific job using SerpAPI Google News.
 * Requires authentication — verifies the job belongs to the requesting user.
 *
 * Uses the Supabase service-role key to bypass RLS when inserting intel_items.
 */

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Service-role client — bypasses RLS for intel_items inserts
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL         ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY        ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
)

type RawItem = {
  source: string
  item_type: string
  title: string
  url: string | null
  summary: string | null
  published_at: string
  tags: string[]
}

// ─── Google News via SerpAPI ──────────────────────────────────────────────

async function fetchGoogleNewsForJob(
  companyName: string,
  roleTitle: string
): Promise<RawItem[]> {
  const apiKey = process.env.SERP_API_KEY
  if (!apiKey) return []

  const queries = [
    `"${companyName}"`,
    `"${companyName}" ${roleTitle}`,
    `"${companyName}" funding news`,
    `"${companyName}" product launch`,
  ]

  const results: RawItem[] = []
  const seenUrls = new Set<string>()

  for (const q of queries) {
    try {
      const url = `https://serpapi.com/search.json?engine=google_news&q=${encodeURIComponent(q)}&api_key=${apiKey}`
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
      console.error(`fetchGoogleNews(${q}):`, e)
    }
  }

  return results
}

// ─── Dedup + upsert ───────────────────────────────────────────────────────

async function upsertItems(items: RawItem[], jobId: string): Promise<number> {
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
  if (error) { console.error('upsertItems:', error); return 0 }
  return newItems.length
}

// ─── Route handler ────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const jobId = request.nextUrl.searchParams.get('job_id')
    if (!jobId) {
      return NextResponse.json({ ok: false, error: 'job_id required' }, { status: 400 })
    }

    // Verify the requesting user owns this job
    const cookieStore = await cookies()
    const userSupabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { data: { user } } = await userSupabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { data: job } = await supabaseAdmin
      .from('jobs')
      .select('company_name, role_title')
      .eq('id', jobId)
      .eq('user_id', user.id)
      .single()

    if (!job) {
      return NextResponse.json({ ok: false, error: 'Job not found' }, { status: 404 })
    }

    const newsItems = await fetchGoogleNewsForJob(job.company_name, job.role_title)
    const inserted  = await upsertItems(newsItems, jobId)

    return NextResponse.json({
      ok: true,
      fetched: newsItems.length,
      inserted,
    })
  } catch (err) {
    console.error('/api/fetch-intel error:', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}

/**
 * /api/fetch-intel
 *
 * Server-side intel fetcher. Called on demand (or by a cron).
 * Currently fetches:
 *   1. Clockwork.io blog / sitemap
 *   2. Google News via SerpAPI (if SERP_API_KEY is set)
 *
 * Returns an array of IntelItem-shaped objects. The client
 * is responsible for upserting them into Supabase.
 *
 * Extend this file to add more sources (LinkedIn scrape, RSS feeds, etc.)
 */

import { NextResponse } from 'next/server'
import { createClient }  from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL         ?? '',
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
)

// ─── Clockwork blog fetcher ───────────────────────────────────────────────

async function fetchClockworkBlog() {
  const results: RawItem[] = []

  try {
    const res = await fetch('https://clockwork.io/blog', {
      headers: { 'User-Agent': 'ClockworkResearchHub/1.0' },
      next: { revalidate: 3600 },
    })
    if (!res.ok) return results

    const html = await res.text()

    // Extract <title> and <meta description> as a lightweight parse
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    const descMatch  = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)

    // Look for article links — adjust selectors as Clockwork's blog evolves
    const articlePattern = /href=["'](\/blog\/[^"'?#]+)["'][^>]*>([^<]{10,120})/gi
    let match: RegExpExecArray | null
    const seen = new Set<string>()

    while ((match = articlePattern.exec(html)) !== null) {
      const path  = match[1]
      const label = match[2].trim()
      const url   = `https://clockwork.io${path}`
      if (seen.has(url)) continue
      seen.add(url)
      results.push({
        source:      'clockwork_blog',
        item_type:   'article',
        title:       label,
        url,
        summary:     null,
        published_at: new Date().toISOString(),
        tags:        ['clockwork', 'blog'],
      })
    }

    // If no articles parsed, at least return the blog page itself
    if (results.length === 0 && titleMatch) {
      results.push({
        source:       'clockwork_blog',
        item_type:    'article',
        title:        titleMatch[1].trim(),
        url:          'https://clockwork.io/blog',
        summary:      descMatch?.[1] ?? null,
        published_at: new Date().toISOString(),
        tags:         ['clockwork', 'blog'],
      })
    }
  } catch (e) {
    console.error('fetchClockworkBlog error:', e)
  }

  return results
}

// ─── Google News via SerpAPI ──────────────────────────────────────────────

async function fetchGoogleNews(): Promise<RawItem[]> {
  const apiKey = process.env.SERP_API_KEY
  if (!apiKey) return []

  const queries = [
    'Clockwork Systems AI',
    'Clockwork.io FleetIQ',
    '"Suresh Vasudevan" Clockwork',
  ]

  const results: RawItem[] = []

  for (const q of queries) {
    try {
      const url = `https://serpapi.com/search.json?engine=google_news&q=${encodeURIComponent(q)}&api_key=${apiKey}`
      const res  = await fetch(url)
      if (!res.ok) continue

      const json = await res.json()
      for (const article of json.news_results ?? []) {
        results.push({
          source:       'news',
          item_type:    'article',
          title:        article.title ?? 'Untitled',
          url:          article.link ?? null,
          summary:      article.snippet ?? null,
          published_at: article.date ? new Date(article.date).toISOString() : new Date().toISOString(),
          tags:         ['news', 'google'],
        })
      }
    } catch (e) {
      console.error(`fetchGoogleNews(${q}):`, e)
    }
  }

  return results
}

// ─── Dedup + upsert into Supabase ────────────────────────────────────────

type RawItem = {
  source: string
  item_type: string
  title: string
  url: string | null
  summary: string | null
  published_at: string
  tags: string[]
}

async function upsertItems(items: RawItem[]): Promise<number> {
  if (!items.length) return 0

  // Fetch existing URLs to avoid duplicates
  const urls = items.map((i) => i.url).filter(Boolean)
  const { data: existing } = await supabaseAdmin
    .from('intel_items')
    .select('url')
    .in('url', urls)

  const existingUrls = new Set((existing ?? []).map((r: { url: string }) => r.url))
  const newItems = items.filter((i) => i.url && !existingUrls.has(i.url))

  if (!newItems.length) return 0

  const { error } = await supabaseAdmin.from('intel_items').insert(newItems)
  if (error) { console.error('upsertItems:', error); return 0 }
  return newItems.length
}

// ─── Route handler ────────────────────────────────────────────────────────

export async function GET() {
  try {
    const [blogItems, newsItems] = await Promise.all([
      fetchClockworkBlog(),
      fetchGoogleNews(),
    ])

    const all = [...blogItems, ...newsItems]
    const inserted = await upsertItems(all)

    return NextResponse.json({
      ok: true,
      fetched: all.length,
      inserted,
      sources: {
        blog: blogItems.length,
        news: newsItems.length,
      },
    })
  } catch (err) {
    console.error('/api/fetch-intel error:', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}

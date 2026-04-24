/**
 * POST /api/profile/scrape
 * Body: { linkedin_url: string }
 *
 * Fetches the LinkedIn profile via Proxycurl, normalises it into
 * our parsed_profile shape, and upserts into user_profiles.
 */
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL         ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY        ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
)

async function getUser() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll()    { return cookieStore.getAll() },
        setAll(cs: { name: string; value: string; options: CookieOptions }[]) {
          cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

interface ProxycurlExperience {
  title?: string
  company?: string
  company_linkedin_profile_url?: string
  starts_at?: { year?: number; month?: number }
  ends_at?: { year?: number; month?: number } | null
  description?: string
}
interface ProxycurlEducation {
  degree_name?: string
  school?: string
  field_of_study?: string
  ends_at?: { year?: number } | null
}
interface ProxycurlPatent {
  title?: string
  patent_number?: string
  issued_on?: string
}
interface ProxycurlCertification {
  name?: string
}

export async function POST(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { linkedin_url } = await req.json()
  if (!linkedin_url) {
    return NextResponse.json({ error: 'linkedin_url required' }, { status: 400 })
  }

  const proxycurlKey = process.env.PROXYCURL_API_KEY
  if (!proxycurlKey) {
    return NextResponse.json({ error: 'PROXYCURL_API_KEY not configured' }, { status: 503 })
  }

  // ── Call Proxycurl ────────────────────────────────────────────────────────
  const proxycurlUrl =
    `https://nubela.co/proxycurl/api/v2/linkedin` +
    `?url=${encodeURIComponent(linkedin_url)}` +
    `&skills=include` +
    `&certifications=include` +
    `&patents=include` +
    `&publications=include`

  const pcRes = await fetch(proxycurlUrl, {
    headers: { Authorization: `Bearer ${proxycurlKey}` },
  })

  if (!pcRes.ok) {
    const body = await pcRes.text()
    console.error('Proxycurl error', pcRes.status, body)
    return NextResponse.json(
      { error: `Proxycurl returned ${pcRes.status}: ${body}` },
      { status: 502 }
    )
  }

  const pc = await pcRes.json()

  // ── Normalise to parsed_profile shape ────────────────────────────────────
  const parsed_profile = {
    source:           'proxycurl' as const,
    name:             [pc.first_name, pc.last_name].filter(Boolean).join(' ') || null,
    headline:         pc.headline ?? null,
    location:         pc.city ?? pc.country_full_name ?? null,
    summary:          pc.summary ?? null,
    skills:           (pc.skills ?? []) as string[],
    experience: (pc.experiences ?? []).map((e: ProxycurlExperience) => ({
      title:       e.title       ?? null,
      company:     e.company     ?? null,
      start:       e.starts_at?.year ? `${e.starts_at.year}-${String(e.starts_at.month ?? 1).padStart(2,'0')}` : null,
      end:         e.ends_at?.year   ? `${e.ends_at.year}-${String((e.ends_at as {year?:number; month?:number}).month ?? 12).padStart(2,'0')}` : 'Present',
      description: e.description ?? null,
    })),
    education: (pc.education ?? []).map((e: ProxycurlEducation) => ({
      degree: [e.degree_name, e.field_of_study].filter(Boolean).join(' in ') || null,
      school: e.school ?? null,
      year:   e.ends_at?.year ?? null,
    })),
    patents: (pc.accomplishment_patents ?? []).map((p: ProxycurlPatent) => ({
      title:  p.title         ?? null,
      number: p.patent_number ?? null,
      date:   p.issued_on     ?? null,
    })),
    certifications: (pc.certifications ?? []).map((c: ProxycurlCertification) => c.name ?? '').filter(Boolean),
  }

  // Flatten to plain text for resume_text (used in gap analysis prompt)
  const resume_text = [
    parsed_profile.name && `Name: ${parsed_profile.name}`,
    parsed_profile.headline && `Headline: ${parsed_profile.headline}`,
    parsed_profile.summary && `\nSummary:\n${parsed_profile.summary}`,
    parsed_profile.skills.length && `\nSkills: ${parsed_profile.skills.join(', ')}`,
    parsed_profile.experience.length && `\nExperience:\n${parsed_profile.experience.map(
      (e: { title: string | null; company: string | null; start: string | null; end: string | null; description: string | null }) =>
        `- ${e.title} at ${e.company} (${e.start ?? '?'} – ${e.end})\n  ${e.description ?? ''}`
    ).join('\n')}`,
    parsed_profile.patents.length && `\nPatents:\n${parsed_profile.patents.map(
      (p: { title: string | null; number: string | null; date: string | null }) => `- ${p.title} (${p.number ?? 'n/a'}, ${p.date ?? 'n/a'})`
    ).join('\n')}`,
    parsed_profile.certifications.length && `\nCertifications: ${parsed_profile.certifications.join(', ')}`,
  ].filter(Boolean).join('\n')

  // ── Upsert into user_profiles ─────────────────────────────────────────────
  const { data, error } = await supabaseAdmin
    .from('user_profiles')
    .upsert(
      {
        user_id:         user.id,
        linkedin_url,
        resume_text,
        parsed_profile,
        last_updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, profile: data })
}

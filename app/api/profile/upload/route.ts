/**
 * POST /api/profile/upload
 * Content-Type: multipart/form-data
 * Field: file (PDF or .txt)  — the user's resume / LinkedIn PDF export
 *
 * Uses Claude to parse the document into our parsed_profile shape,
 * then upserts into user_profiles.
 */
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL         ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY        ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
)

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' })

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

export async function POST(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })

  const allowedTypes = ['application/pdf', 'text/plain', 'text/markdown']
  const isPdf = file.type === 'application/pdf'
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json(
      { error: 'Only PDF and plain text files are supported' },
      { status: 400 }
    )
  }

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  // ── Send to Claude for extraction ─────────────────────────────────────────
  const systemPrompt = `You are a resume/CV parser. Extract structured professional information from the provided document and return ONLY valid JSON matching this exact schema (no markdown, no explanation):
{
  "source": "pdf",
  "name": string | null,
  "headline": string | null,
  "location": string | null,
  "summary": string | null,
  "skills": string[],
  "experience": [{ "title": string|null, "company": string|null, "start": string|null, "end": string|null, "description": string|null }],
  "education": [{ "degree": string|null, "school": string|null, "year": number|null }],
  "patents": [{ "title": string|null, "number": string|null, "date": string|null }],
  "certifications": string[]
}
Return an empty array [] for any section with no data. Never return null for array fields.`

  let claudeMessages: Anthropic.MessageParam[]

  if (isPdf) {
    const base64 = buffer.toString('base64')
    claudeMessages = [
      {
        role: 'user',
        content: [
          {
            type: 'document' as const,
            source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64 },
          },
          { type: 'text', text: 'Parse this resume/CV into the JSON schema described.' },
        ],
      },
    ]
  } else {
    const text = buffer.toString('utf-8')
    claudeMessages = [
      {
        role: 'user',
        content: `Parse this resume/CV into the JSON schema described:\n\n${text}`,
      },
    ]
  }

  const response = await anthropic.messages.create({
    model:      'claude-opus-4-6',
    max_tokens: 4096,
    system:     systemPrompt,
    messages:   claudeMessages,
  })

  const rawText = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

  let parsed_profile: Record<string, unknown>
  try {
    // Strip any accidental markdown fences
    const cleaned = rawText.replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim()
    parsed_profile = JSON.parse(cleaned)
  } catch {
    console.error('Claude returned non-JSON:', rawText.slice(0, 200))
    return NextResponse.json({ error: 'Failed to parse Claude response as JSON' }, { status: 500 })
  }

  // Build flat resume_text for gap analysis prompt
  const skills       = (parsed_profile.skills        as string[]     ?? [])
  const experience   = (parsed_profile.experience    as {title?:string|null;company?:string|null;start?:string|null;end?:string|null;description?:string|null}[] ?? [])
  const patents      = (parsed_profile.patents        as {title?:string|null;number?:string|null;date?:string|null}[] ?? [])
  const certifications = (parsed_profile.certifications as string[]  ?? [])

  const resume_text = [
    parsed_profile.name      && `Name: ${parsed_profile.name}`,
    parsed_profile.headline  && `Headline: ${parsed_profile.headline}`,
    parsed_profile.summary   && `\nSummary:\n${parsed_profile.summary}`,
    skills.length            && `\nSkills: ${skills.join(', ')}`,
    experience.length        && `\nExperience:\n${experience.map(
      (e) => `- ${e.title} at ${e.company} (${e.start ?? '?'} – ${e.end ?? 'Present'})\n  ${e.description ?? ''}`
    ).join('\n')}`,
    patents.length           && `\nPatents:\n${patents.map(
      (p) => `- ${p.title} (${p.number ?? 'n/a'}, ${p.date ?? 'n/a'})`
    ).join('\n')}`,
    certifications.length    && `\nCertifications: ${certifications.join(', ')}`,
  ].filter(Boolean).join('\n')

  // ── Upsert into user_profiles ─────────────────────────────────────────────
  const { data, error } = await supabaseAdmin
    .from('user_profiles')
    .upsert(
      {
        user_id:         user.id,
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

/**
 * /api/research/entities
 *
 * POST   { job_id, name, role, title?, linkedin_url? }  → add entity
 * PATCH  { id, name?, role?, title?, linkedin_url? }     → update entity
 * DELETE { id }                                          → delete entity
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
        getAll() { return cookieStore.getAll() },
        setAll(cs: { name: string; value: string; options: CookieOptions }[]) {
          cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// ── POST — add a new entity ───────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { job_id, name, role, title, linkedin_url } = body

  if (!job_id || !name || !role) {
    return NextResponse.json({ error: 'job_id, name and role are required' }, { status: 400 })
  }

  const dedup_key = `manual:${name.toLowerCase().replace(/\s+/g, '_')}`

  const { data, error } = await supabaseAdmin
    .from('company_entities')
    .insert({ job_id, name, role, title: title ?? null, linkedin_url: linkedin_url ?? null, dedup_key, source: 'manual' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, entity: data })
}

// ── PATCH — update an entity ──────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { id, ...fields } = body

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const allowed = ['name', 'role', 'title', 'linkedin_url']
  const updates: Record<string, unknown> = { source: 'manual' }
  for (const key of allowed) {
    if (key in fields) updates[key] = fields[key] ?? null
  }

  const { data, error } = await supabaseAdmin
    .from('company_entities')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, entity: data })
}

// ── DELETE — remove an entity ─────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('company_entities')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

/**
 * POST /api/admin/retry
 * Body: { research_job_id: string }
 * Resets a stuck/failed job to pending and re-fires the Inngest event.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { inngest } from '@/inngest/client'

const ADMIN_EMAIL = 'douglasyoud@gmail.com'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL         ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY        ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
)

export async function POST(request: NextRequest) {
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
  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  let body: { research_job_id?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const { research_job_id } = body
  if (!research_job_id) {
    return NextResponse.json({ ok: false, error: 'research_job_id required' }, { status: 400 })
  }

  const { data: rj, error: fetchErr } = await supabaseAdmin
    .from('research_jobs')
    .select('id, job_id')
    .eq('id', research_job_id)
    .single()

  if (fetchErr || !rj) {
    return NextResponse.json({ ok: false, error: 'Research job not found' }, { status: 404 })
  }

  const { error: updateErr } = await supabaseAdmin
    .from('research_jobs')
    .update({ status: 'pending', error_message: null, phases_complete: [], updated_at: new Date().toISOString() })
    .eq('id', research_job_id)

  if (updateErr) {
    return NextResponse.json({ ok: false, error: String(updateErr) }, { status: 500 })
  }

  try {
    await inngest.send({ name: 'research/job.created', data: { jobId: rj.job_id, researchJobId: rj.id } })
  } catch (e) {
    return NextResponse.json({ ok: false, error: `Inngest send failed: ${e}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true, research_job_id, status: 'pending' })
}

/**
 * POST /api/research/start
 * Body: { job_id: string, trigger?: "job_added"|"weekly"|"intel_triggered"|"manual" }
 *
 * Creates a research_jobs row and fires the Inngest event.
 * Returns 202 immediately — the agent runs asynchronously.
 * If a job is already running/pending for this job, returns the existing ID.
 */

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { inngest } from '@/inngest/client'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { job_id: jobId, trigger = 'manual' } = body as {
      job_id: string
      trigger?: string
    }

    if (!jobId) {
      return NextResponse.json({ ok: false, error: 'job_id required' }, { status: 400 })
    }

    // Verify auth
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

    // Verify job ownership
    const { data: job } = await supabaseAdmin
      .from('jobs')
      .select('id, company_name')
      .eq('id', jobId)
      .eq('user_id', user.id)
      .single()

    if (!job) {
      return NextResponse.json({ ok: false, error: 'Job not found' }, { status: 404 })
    }

    // Idempotency check — don't queue if already pending/running
    const { data: existing } = await supabaseAdmin
      .from('research_jobs')
      .select('id, status')
      .eq('job_id', jobId)
      .in('status', ['pending', 'running'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({
        ok: true,
        research_job_id: existing.id,
        already_running: true,
      })
    }

    // Create research job row
    const { data: researchJob, error } = await supabaseAdmin
      .from('research_jobs')
      .insert({
        job_id:           jobId,
        user_id:          user.id,
        status:           'pending',
        trigger,
        progress_pct:     0,
        progress_message: 'Queued…',
      })
      .select()
      .single()

    if (error || !researchJob) {
      console.error('create research_job:', error)
      return NextResponse.json({ ok: false, error: 'Failed to queue research job' }, { status: 500 })
    }

    // Fire Inngest event (non-blocking)
    await inngest.send({
      name: 'research/job.created',
      data: { jobId, researchJobId: researchJob.id },
    })

    return NextResponse.json({ ok: true, research_job_id: researchJob.id }, { status: 202 })
  } catch (err) {
    console.error('/api/research/start:', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}

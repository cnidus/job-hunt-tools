/**
 * POST /api/research/start
 * Body: { job_id: string }
 *
 * Creates a research_jobs row and fires research/job.created to Inngest.
 * Idempotent — returns existing job if one is already pending/running.
 */

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { inngest } from '@/inngest/client'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL         ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY        ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
)

export async function POST(request: NextRequest) {
  try {
    const { job_id: jobId } = await request.json()
    if (!jobId) {
      return NextResponse.json({ ok: false, error: 'job_id required' }, { status: 400 })
    }

    // Auth check
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
      .select('id, company_name, role_title')
      .eq('id', jobId)
      .eq('user_id', user.id)
      .single()

    if (!job) {
      return NextResponse.json({ ok: false, error: 'Job not found' }, { status: 404 })
    }

    // Idempotency: return existing job if already pending/running
    const { data: existing } = await supabaseAdmin
      .from('research_jobs')
      .select('id, status')
      .eq('job_id', jobId)
      .in('status', ['pending', 'running'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ ok: true, research_job_id: existing.id, status: existing.status })
    }

    // Create new research_jobs row
    const { data: researchJob, error: createError } = await supabaseAdmin
      .from('research_jobs')
      .insert({
        job_id:  jobId,
        status:  'pending',
        trigger: 'manual',
        phases_complete: [],
      })
      .select()
      .single()

    if (createError || !researchJob) {
      console.error('create research_job:', createError)
      return NextResponse.json({ ok: false, error: 'Failed to create research job' }, { status: 500 })
    }

    // Fire Inngest event
    await inngest.send({
      name: 'research/job.created',
      data: { jobId, researchJobId: researchJob.id },
    })

    return NextResponse.json(
      { ok: true, research_job_id: researchJob.id, status: 'pending' },
      { status: 202 }
    )
  } catch (err) {
    console.error('/api/research/start error:', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}

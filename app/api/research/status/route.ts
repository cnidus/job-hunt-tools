/**
 * GET /api/research/status?job_id=<uuid>
 *
 * Returns the latest research_job row for a given job.
 * Polled by the frontend every 5s while status is pending/running.
 * Uses service-role to bypass RLS (the job_id is the access control here).
 */

import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get('job_id')
  if (!jobId) {
    return NextResponse.json({ ok: false, error: 'job_id required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('research_jobs')
    .select('id, status, progress_pct, progress_message, phases_complete, started_at, completed_at, error_message, trigger, created_at')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('/api/research/status:', error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, research_job: data ?? null })
}

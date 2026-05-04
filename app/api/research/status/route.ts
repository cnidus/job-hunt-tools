/**
 * GET /api/research/status?job_id=<uuid>
 *
 * Returns the latest research_jobs row for a given job.
 * Used by the frontend to poll progress.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { getAdminClient } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'


export async function GET(request: NextRequest) {
  const supabaseAdmin = getAdminClient()
  const jobId = request.nextUrl.searchParams.get('job_id')
  if (!jobId) {
    return NextResponse.json({ ok: false, error: 'job_id required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('research_jobs')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }

  return NextResponse.json({ ok: true, research_job: data ?? null })
}

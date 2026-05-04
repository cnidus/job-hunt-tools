/**
 * POST /api/admin/cancel
 * Body: { research_job_id: string }
 * Marks a pending/running job as failed so the frontend stops polling.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { getAdminClient } from '@/lib/supabase-admin'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'


const ADMIN_EMAIL = 'douglasyoud@gmail.com'

export async function POST(request: NextRequest) {
  const supabaseAdmin = getAdminClient()
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

  const { error } = await supabaseAdmin
    .from('research_jobs')
    .update({ status: 'failed', error_message: 'Cancelled by admin', updated_at: new Date().toISOString() })
    .eq('id', research_job_id)
    .in('status', ['pending', 'running'])

  if (error) return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })

  return NextResponse.json({ ok: true })
}

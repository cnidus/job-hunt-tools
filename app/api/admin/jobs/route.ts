/**
 * GET /api/admin/jobs — returns all research_jobs for admin dashboard polling.
 * Gated to douglasyoud@gmail.com.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const ADMIN_EMAIL = 'douglasyoud@gmail.com'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL         ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY        ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
)

export async function GET(_request: NextRequest) {
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

  const { data: jobs, error } = await supabaseAdmin
    .from('research_jobs')
    .select(`
      id, job_id, status, trigger, phases_complete,
      error_message, created_at, updated_at,
      jobs ( company_name, role_title, user_id )
    `)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })

  return NextResponse.json({ ok: true, jobs: jobs ?? [] })
}

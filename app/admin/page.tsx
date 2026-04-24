/**
 * app/admin/page.tsx
 * Admin-only dashboard — gated to douglasyoud@gmail.com.
 */

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import AdminConsole from '@/components/AdminConsole'

const ADMIN_EMAIL = 'douglasyoud@gmail.com'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
)

/** Mirror of ResearchJob in AdminConsole (not exported from that file) */
interface ResearchJob {
  id: string
  job_id: string
  status: 'pending' | 'running' | 'complete' | 'failed'
  trigger: string | null
  phases_complete: string[]
  error_message: string | null
  created_at: string
  updated_at: string
  jobs: { company_name: string; role_title: string; user_id: string } | null
}

export default async function AdminPage() {
  // ── Auth check ──────────────────────────────────────────────────────────────
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
    redirect('/')
  }

  // ── Fetch all research jobs ─────────────────────────────────────────────────
  const { data: rawJobs } = await supabaseAdmin
    .from('research_jobs')
    .select(`
      id, job_id, status, trigger, phases_complete,
      error_message, created_at, updated_at,
      jobs ( company_name, role_title, user_id )
    `)
    .order('created_at', { ascending: false })
    .limit(200)

  // Supabase infers joined relations as arrays in its generated types;
  // cast through unknown so we work with our known shape.
  const jobs = (rawJobs ?? []) as unknown as ResearchJob[]

  // ── Resolve user emails ─────────────────────────────────────────────────────
  const userIds = [
    ...new Set(jobs.map((j) => j.jobs?.user_id).filter(Boolean)),
  ] as string[]

  const userMap: Record<string, string> = {}
  await Promise.all(
    userIds.map(async (uid) => {
      const { data } = await supabaseAdmin.auth.admin.getUserById(uid)
      if (data?.user?.email) userMap[uid] = data.user.email
    })
  )

  return <AdminConsole initialJobs={jobs} userMap={userMap} />
}

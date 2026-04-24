/**
 * POST /api/admin/migrate
 * One-shot migration runner — bakes in migration_user_profile.sql.
 * Calls the Supabase Management API via SUPABASE_ACCESS_TOKEN.
 * Protected to douglasyoud@gmail.com only. Delete after migration applied.
 */
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const ADMIN_EMAIL  = 'douglasyoud@gmail.com'
const PROJECT_REF  = 'gwnnaafrbsszyviimnfc'

const MIGRATION_SQL = `
-- ============================================================
-- Migration: User profile + LinkedIn/resume gap analysis
-- ============================================================

CREATE TABLE IF NOT EXISTS user_profiles (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  linkedin_url     text,
  resume_text      text,
  parsed_profile   jsonb       NOT NULL DEFAULT '{}',
  last_updated_at  timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_profiles_own" ON user_profiles;
CREATE POLICY "user_profiles_own"
  ON user_profiles FOR ALL TO authenticated
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS user_profiles_user_id_idx ON user_profiles(user_id);

ALTER TABLE research_jobs
  ADD COLUMN IF NOT EXISTS gap_analysis jsonb;

CREATE OR REPLACE FUNCTION update_updated_at_if_missing()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'user_profiles_updated_at'
  ) THEN
    CREATE TRIGGER user_profiles_updated_at
      BEFORE UPDATE ON user_profiles
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END;
$$;

SELECT update_updated_at_if_missing();
`

export async function POST() {
  const cookieStore = await cookies()
  const userSupabase = createServerClient(
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
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) {
    return NextResponse.json(
      { error: 'SUPABASE_ACCESS_TOKEN not configured in Vercel env vars' },
      { status: 503 }
    )
  }

  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method:  'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: MIGRATION_SQL }),
    }
  )

  const result = await res.json()
  return NextResponse.json({
    ok:     res.ok,
    status: res.status,
    result,
  })
}

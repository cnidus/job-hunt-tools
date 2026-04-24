-- ============================================================
-- Migration: User profile + LinkedIn/resume gap analysis
-- Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- 1. user_profiles — one row per user, global across all jobs
CREATE TABLE IF NOT EXISTS user_profiles (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  linkedin_url     text,
  resume_text      text,                   -- raw text extracted from PDF or LinkedIn scrape
  parsed_profile   jsonb       NOT NULL DEFAULT '{}',
  -- parsed_profile shape:
  -- {
  --   name, headline, location, summary,
  --   skills: string[],
  --   experience: [{ title, company, start, end, description }],
  --   education: [{ degree, school, year }],
  --   patents: [{ title, number, date }],
  --   certifications: string[],
  --   source: 'proxycurl' | 'pdf' | 'manual'
  -- }
  last_updated_at  timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_profiles_own"
  ON user_profiles FOR ALL TO authenticated
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS user_profiles_user_id_idx ON user_profiles(user_id);

-- 2. Add gap_analysis column to research_jobs
ALTER TABLE research_jobs
  ADD COLUMN IF NOT EXISTS gap_analysis jsonb;
-- gap_analysis shape:
-- {
--   match_score: number (0-100),
--   skill_radar: [{ skill: string, user_level: number, required_level: number }],
--   study_topics: [{ topic: string, priority: 'high'|'medium'|'low', reason: string, resources: string[] }],
--   strengths: [{ area: string, detail: string }],
--   talking_points: [{ requirement: string, talking_point: string, evidence: string }],
--   generated_at: string (ISO date)
-- }

-- 3. Updated-at trigger for user_profiles
DROP TRIGGER IF EXISTS user_profiles_updated_at ON user_profiles;
CREATE TRIGGER user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

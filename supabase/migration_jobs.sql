-- ============================================================
-- Migration: Generic multi-job hub
-- Run after migration_auth.sql
-- ============================================================

-- 1. Jobs table — one row per job the user is tracking
CREATE TABLE IF NOT EXISTS jobs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name text        NOT NULL,
  role_title   text        NOT NULL,
  company_url  text,
  job_url      text,
  salary_min   int,
  salary_max   int,
  location     text,
  status       text        NOT NULL DEFAULT 'applied',
  applied_at   date,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "jobs_all" ON jobs;
CREATE POLICY "jobs_all" ON jobs
  FOR ALL TO authenticated
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. Add job_id FK to all per-job tables
ALTER TABLE intel_items
  ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES jobs(id) ON DELETE CASCADE;

ALTER TABLE daily_tasks
  ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES jobs(id) ON DELETE CASCADE;

ALTER TABLE research_notes
  ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES jobs(id) ON DELETE CASCADE;

ALTER TABLE mastery_completions
  ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES jobs(id) ON DELETE CASCADE;

-- 3. Update intel_items RLS — users only see items for their own jobs
--    (null job_id items are legacy Clockwork data, still visible to all authed users)
DROP POLICY IF EXISTS "intel_items_select" ON intel_items;
CREATE POLICY "intel_items_select" ON intel_items
  FOR SELECT TO authenticated USING (
    job_id IS NULL
    OR EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = intel_items.job_id
        AND jobs.user_id = auth.uid()
    )
  );

-- 4. Update mastery_completions unique constraint to be per-job
--    Drop the old global unique constraint first.
ALTER TABLE mastery_completions
  DROP CONSTRAINT IF EXISTS mastery_completions_user_id_mastery_item_id_key;

-- Per-job completions (primary use case going forward)
DROP INDEX IF EXISTS mastery_completions_per_job_idx;
CREATE UNIQUE INDEX mastery_completions_per_job_idx
  ON mastery_completions(user_id, mastery_item_id, job_id)
  WHERE job_id IS NOT NULL;

-- Global completions (backward compat — no job assigned)
DROP INDEX IF EXISTS mastery_completions_global_idx;
CREATE UNIQUE INDEX mastery_completions_global_idx
  ON mastery_completions(user_id, mastery_item_id)
  WHERE job_id IS NULL;

-- 5. Performance indexes
CREATE INDEX IF NOT EXISTS intel_items_job_id_idx       ON intel_items(job_id);
CREATE INDEX IF NOT EXISTS daily_tasks_job_id_idx       ON daily_tasks(job_id);
CREATE INDEX IF NOT EXISTS research_notes_job_id_idx    ON research_notes(job_id);
CREATE INDEX IF NOT EXISTS mastery_completions_job_idx  ON mastery_completions(job_id);

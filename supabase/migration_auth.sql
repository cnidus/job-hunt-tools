-- ============================================================
-- Migration: Multi-user auth support
-- Run this in the Supabase SQL Editor after enabling Google
-- OAuth in Authentication → Providers.
-- ============================================================

-- 1. Add user_id to user_actions
--    Unique constraint becomes (item_id, action, user_id) so each
--    user can independently mark items read/bookmarked/etc.
ALTER TABLE user_actions
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE user_actions
  DROP CONSTRAINT IF EXISTS user_actions_item_id_action_key;

ALTER TABLE user_actions
  ADD CONSTRAINT user_actions_item_id_action_user_id_key
  UNIQUE (item_id, action, user_id);

-- 2. Add user_id to daily_tasks
--    Each user gets their own tasks seeded on first load of each day.
ALTER TABLE daily_tasks
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- 3. Add user_id to research_notes
ALTER TABLE research_notes
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- 4. Create mastery_completions
--    mastery_items stays as a shared template list (seeded once).
--    Each user's completions live here instead.
CREATE TABLE IF NOT EXISTS mastery_completions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mastery_item_id uuid        NOT NULL REFERENCES mastery_items(id) ON DELETE CASCADE,
  completed_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, mastery_item_id)
);

-- ============================================================
-- 5. Enable Row Level Security on all tables
-- ============================================================
ALTER TABLE intel_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_actions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_tasks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE mastery_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE mastery_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_notes      ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 6. intel_items — shared feed, read by all authenticated users
--    Inserts come from the server-side API route (service role
--    bypasses RLS, so no insert policy needed here).
-- ============================================================
DROP POLICY IF EXISTS "intel_items_select" ON intel_items;
CREATE POLICY "intel_items_select" ON intel_items
  FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 7. user_actions — fully per-user
-- ============================================================
DROP POLICY IF EXISTS "user_actions_select" ON user_actions;
CREATE POLICY "user_actions_select" ON user_actions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_actions_insert" ON user_actions;
CREATE POLICY "user_actions_insert" ON user_actions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_actions_update" ON user_actions;
CREATE POLICY "user_actions_update" ON user_actions
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_actions_delete" ON user_actions;
CREATE POLICY "user_actions_delete" ON user_actions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 8. daily_tasks — per-user
-- ============================================================
DROP POLICY IF EXISTS "daily_tasks_all" ON daily_tasks;
CREATE POLICY "daily_tasks_all" ON daily_tasks
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 9. mastery_items — shared read-only template
-- ============================================================
DROP POLICY IF EXISTS "mastery_items_select" ON mastery_items;
CREATE POLICY "mastery_items_select" ON mastery_items
  FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 10. mastery_completions — per-user
-- ============================================================
DROP POLICY IF EXISTS "mastery_completions_all" ON mastery_completions;
CREATE POLICY "mastery_completions_all" ON mastery_completions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 11. research_notes — per-user
-- ============================================================
DROP POLICY IF EXISTS "research_notes_all" ON research_notes;
CREATE POLICY "research_notes_all" ON research_notes
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- Migration: Inngest research agent tables
-- Run after migration_jobs.sql
-- ============================================================

-- ── Postgres helper: append a phase name to phases_complete array ──────────
CREATE OR REPLACE FUNCTION append_phase_complete(job_id uuid, phase_name text)
RETURNS void LANGUAGE sql AS $$
  UPDATE research_jobs
  SET phases_complete = array_append(phases_complete, phase_name)
  WHERE id = job_id
    AND NOT (phases_complete @> ARRAY[phase_name]);
$$;

-- ── Research job queue ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS research_jobs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id           uuid        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status           text        NOT NULL DEFAULT 'pending',   -- pending|running|complete|failed
  progress_pct     int         NOT NULL DEFAULT 0,
  progress_message text,
  trigger          text        NOT NULL DEFAULT 'manual',    -- job_added|weekly|intel_triggered|manual
  phases_complete  text[]      NOT NULL DEFAULT '{}',
  started_at       timestamptz,
  completed_at     timestamptz,
  error_message    text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE research_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "research_jobs_owner" ON research_jobs;
CREATE POLICY "research_jobs_owner" ON research_jobs
  FOR ALL TO authenticated
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS research_jobs_job_id_idx  ON research_jobs(job_id);
CREATE INDEX IF NOT EXISTS research_jobs_status_idx  ON research_jobs(status);

-- ── Company profile (one per job, upserted by P1) ─────────────────────────
CREATE TABLE IF NOT EXISTS company_profiles (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id                uuid        NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
  description           text,
  short_description     text,
  founded_year          int,
  hq_location           text,
  employee_count_label  text,        -- "51–200 employees"
  employee_count_min    int,
  employee_count_max    int,
  industry              text,
  company_stage         text,        -- seed|series-a|series-b|growth|public
  total_funding_usd     bigint,
  last_round_type       text,
  last_round_amount_usd bigint,
  last_round_date       date,
  crunchbase_url        text,
  linkedin_url          text,
  twitter_url           text,
  raw_crunchbase        jsonb,
  last_crunchbase_fetch timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE company_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_profiles_owner" ON company_profiles;
CREATE POLICY "company_profiles_owner" ON company_profiles
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM jobs
            WHERE jobs.id = company_profiles.job_id
              AND jobs.user_id = auth.uid())
  );

-- ── Company entities: founders, executives, investors ─────────────────────
CREATE TABLE IF NOT EXISTS company_entities (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       uuid        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  entity_type  text        NOT NULL,   -- founder|executive|investor|board_member|advisor
  name         text        NOT NULL,
  title        text,
  bio          text,
  linkedin_url text,
  twitter_url  text,
  source       text        NOT NULL DEFAULT 'crunchbase',  -- crunchbase|serpapi|manual
  source_url   text,
  dedup_key    text        NOT NULL,   -- {job_id}:{lower(name)}
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE company_entities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_entities_owner" ON company_entities;
CREATE POLICY "company_entities_owner" ON company_entities
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM jobs
            WHERE jobs.id = company_entities.job_id
              AND jobs.user_id = auth.uid())
  );

DROP INDEX IF EXISTS company_entities_dedup_idx;
CREATE UNIQUE INDEX company_entities_dedup_idx ON company_entities(dedup_key);
CREATE INDEX IF NOT EXISTS company_entities_job_id_idx ON company_entities(job_id);

-- ── Company investors ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS company_investors (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id         uuid        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  name           text        NOT NULL,
  investor_type  text,        -- vc_firm|angel|corporate|accelerator
  lead_investor  boolean     DEFAULT false,
  round          text,
  crunchbase_url text,
  source         text        NOT NULL DEFAULT 'crunchbase',
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE company_investors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_investors_owner" ON company_investors;
CREATE POLICY "company_investors_owner" ON company_investors
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM jobs
            WHERE jobs.id = company_investors.job_id
              AND jobs.user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS company_investors_job_id_idx ON company_investors(job_id);

-- ── Research papers ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS research_papers (
  id                 uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id             uuid          NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  entity_id          uuid          REFERENCES company_entities(id) ON DELETE SET NULL,
  title              text          NOT NULL,
  authors            jsonb,        -- [{name: string, entity_id?: string}]
  year               int,
  abstract           text,
  citation_count     int,
  url                text,
  doi                text,
  -- Relevance — set by Claude in P5
  relevance_category text,         -- core_to_company|relevant_to_role|tangential|not_relevant
  relevance_score    numeric(3,2), -- 0.00–1.00
  relevance_note     text,
  source             text          NOT NULL DEFAULT 'semantic_scholar',
  dedup_key          text          NOT NULL,
  fetched_at         timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE research_papers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "research_papers_owner" ON research_papers;
CREATE POLICY "research_papers_owner" ON research_papers
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM jobs
            WHERE jobs.id = research_papers.job_id
              AND jobs.user_id = auth.uid())
  );

DROP INDEX IF EXISTS research_papers_dedup_idx;
CREATE UNIQUE INDEX research_papers_dedup_idx ON research_papers(job_id, dedup_key);
CREATE INDEX IF NOT EXISTS research_papers_job_id_idx     ON research_papers(job_id);
CREATE INDEX IF NOT EXISTS research_papers_entity_id_idx  ON research_papers(entity_id);
CREATE INDEX IF NOT EXISTS research_papers_relevance_idx  ON research_papers(job_id, relevance_score DESC NULLS LAST);

-- ── Patents ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patents (
  id                 uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id             uuid          NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  entity_id          uuid          REFERENCES company_entities(id) ON DELETE SET NULL,
  title              text          NOT NULL,
  inventors          jsonb,        -- [{name: string, entity_id?: string}]
  patent_number      text,
  filing_date        date,
  grant_date         date,
  abstract           text,
  url                text,
  relevance_category text,
  relevance_score    numeric(3,2),
  relevance_note     text,
  source             text          NOT NULL DEFAULT 'google_patents',
  dedup_key          text          NOT NULL,
  fetched_at         timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE patents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "patents_owner" ON patents;
CREATE POLICY "patents_owner" ON patents
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM jobs
            WHERE jobs.id = patents.job_id
              AND jobs.user_id = auth.uid())
  );

DROP INDEX IF EXISTS patents_dedup_idx;
CREATE UNIQUE INDEX patents_dedup_idx ON patents(job_id, dedup_key);
CREATE INDEX IF NOT EXISTS patents_job_id_idx    ON patents(job_id);
CREATE INDEX IF NOT EXISTS patents_entity_id_idx ON patents(entity_id);

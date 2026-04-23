-- ─── Research pipeline tables ───────────────────────────────────────────────
-- Run after migration_jobs.sql

-- research_jobs: tracks pipeline runs per job
CREATE TABLE IF NOT EXISTS research_jobs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id           uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  status           text NOT NULL DEFAULT 'pending'   -- pending | running | complete | failed
    CHECK (status IN ('pending','running','complete','failed')),
  trigger          text NOT NULL DEFAULT 'manual'    -- manual | scheduled | material_event
    CHECK (trigger IN ('manual','scheduled','material_event')),
  phases_complete  text[] NOT NULL DEFAULT '{}',
  error_message    text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE research_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own research_jobs"
  ON research_jobs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM jobs WHERE jobs.id = research_jobs.job_id
      AND jobs.user_id = auth.uid()
  ));

-- company_profiles: one row per job
CREATE TABLE IF NOT EXISTS company_profiles (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id           uuid NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
  description      text,
  employee_count   text,
  founded_year     int,
  hq_location      text,
  funding_total    numeric,   -- USD millions
  funding_stage    text,
  ceo_name         text,
  ceo_linkedin     text,
  website          text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE company_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own company_profiles"
  ON company_profiles FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM jobs WHERE jobs.id = company_profiles.job_id
      AND jobs.user_id = auth.uid()
  ));

-- company_entities: founders, CEOs, CTOs, etc.
CREATE TABLE IF NOT EXISTS company_entities (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id           uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  dedup_key        text NOT NULL UNIQUE,  -- {job_id}:{lower(name)}
  name             text NOT NULL,
  role             text NOT NULL          -- founder | ceo | cto | vp | investor | advisor | board
    CHECK (role IN ('founder','ceo','cto','vp','investor','advisor','board')),
  title            text,
  linkedin_url     text,
  source           text,                  -- serp_kg | serp_rq | crunchbase | manual
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE company_entities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own company_entities"
  ON company_entities FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM jobs WHERE jobs.id = company_entities.job_id
      AND jobs.user_id = auth.uid()
  ));

-- company_investors
CREATE TABLE IF NOT EXISTS company_investors (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id           uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  dedup_key        text NOT NULL UNIQUE,  -- {job_id}:{lower(name)}
  name             text NOT NULL,
  stage            text,
  amount_usd       numeric,
  source           text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE company_investors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own company_investors"
  ON company_investors FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM jobs WHERE jobs.id = company_investors.job_id
      AND jobs.user_id = auth.uid()
  ));

-- research_papers: Semantic Scholar results
CREATE TABLE IF NOT EXISTS research_papers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id              uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  dedup_key           text NOT NULL UNIQUE,  -- ss:{paperId} or doi:{DOI}
  external_id         text NOT NULL,
  title               text NOT NULL,
  authors             text[] NOT NULL DEFAULT '{}',
  abstract            text,
  year                int,
  venue               text,
  citation_count      int NOT NULL DEFAULT 0,
  url                 text,
  entity_name         text,                   -- which founder/exec this was found under
  relevance_category  text,                   -- core_to_company | relevant_to_role | tangential | not_relevant
  relevance_score     numeric,                -- 0.0–1.0
  relevance_note      text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE research_papers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own research_papers"
  ON research_papers FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM jobs WHERE jobs.id = research_papers.job_id
      AND jobs.user_id = auth.uid()
  ));

-- patents: Google Patents results
CREATE TABLE IF NOT EXISTS patents (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id              uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  dedup_key           text NOT NULL UNIQUE,  -- patent:{patent_id} or title:{slug}
  patent_id           text,
  title               text NOT NULL,
  inventors           text[] NOT NULL DEFAULT '{}',
  assignee            text,
  filing_date         text,
  url                 text,
  abstract            text,
  entity_name         text,
  relevance_category  text,
  relevance_score     numeric,
  relevance_note      text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE patents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own patents"
  ON patents FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM jobs WHERE jobs.id = patents.job_id
      AND jobs.user_id = auth.uid()
  ));

-- RPC: atomically append a phase name to phases_complete
CREATE OR REPLACE FUNCTION append_phase_complete(
  p_research_job_id uuid,
  p_phase           text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE research_jobs
  SET    phases_complete = array_append(phases_complete, p_phase),
         updated_at      = now()
  WHERE  id = p_research_job_id
    AND  NOT (p_phase = ANY(phases_complete));
END;
$$;

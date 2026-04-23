# Architecture Overview — Job Tracker Research Agent

## Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js 15 (App Router) on Vercel | UI, auth, API routes |
| Database | Supabase (PostgreSQL + RLS) | All persistent state |
| Auth | Supabase + Google OAuth | Email-allowlisted login |
| Job queue | Inngest | Async research pipeline (see below) |
| News | SerpAPI Google News | Intel feed |
| Company data | Crunchbase Basic API | Funding, headcount, founders |
| Papers | Semantic Scholar API (free) | Research papers by entity |
| Patents | SerpAPI Google Patents | Patents by inventor + company |
| AI synthesis | Anthropic claude-sonnet-4-5 | Relevance scoring (single call, P5 only) |

## Data model

```
jobs                   ← one per tracked role
  └─ intel_items       ← news articles per job
  └─ user_actions      ← read/bookmark state per item
  └─ daily_tasks       ← daily prep tasks per job
  └─ mastery_completions
  └─ research_notes
  └─ research_jobs     ← async pipeline run state
  └─ company_profiles  ← Crunchbase structured data
  └─ company_entities  ← founders/execs with LinkedIn links
  └─ company_investors ← VC firms, angels
  └─ research_papers   ← Semantic Scholar papers (with relevance scores)
  └─ patents           ← Google Patents (with relevance scores)
```

## Key architectural decisions

### Why Inngest instead of Vercel background functions or GCP

See [gcp-extension-guide.md](./gcp-extension-guide.md) for the full comparison.
Short version: Inngest gives per-step retry, DLQ, and dashboard observability with
zero new infrastructure. It integrates natively with Next.js.

### Why Claude is called only once (P5)

Running Claude as the orchestrator (deciding which APIs to call) costs ~$1.50–$3 per
research run because every tool-call round-trip carries the full conversation history.
The phase model is deterministic: phases 1–4 are standard API calls, Claude only touches
P5 for a single batch synthesis call (~$0.10). This gives a ~20× cost reduction.

### Crunchbase call optimization

Crunchbase's free Basic tier allows 200 calls/month. The agent only calls it on:
1. Job added (always)
2. Weekly scheduled refresh (Vercel cron `0 8 * * 1`)
3. When new intel contains a material-event keyword (see `detectMaterialEvent` in
   `inngest/research-agent.ts`)
4. Manual "Re-run" button

### RLS and security

All tables use Supabase Row Level Security. The `research_jobs`, `company_profiles`,
`company_entities`, `research_papers`, and `patents` tables are only accessible to the
authenticated user who owns the parent `jobs` row.

The Inngest agent uses the `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS) because it runs
server-side and needs to write results without a user session. This key is never exposed
to the client.

## Environment variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # server-side only

# APIs
SERP_API_KEY=                        # SerpAPI (news + patents + LinkedIn search)
CRUNCHBASE_API_KEY=                  # Crunchbase Basic (free, 200 calls/mo)
ANTHROPIC_API_KEY=                   # Anthropic (P5 synthesis only)

# Inngest
INNGEST_EVENT_KEY=                   # from app.inngest.com
INNGEST_SIGNING_KEY=                 # from app.inngest.com
```

## File map

```
inngest/
  client.ts               ← Inngest client singleton
  research-agent.ts       ← 5-phase agent function

app/api/
  inngest/route.ts        ← Inngest serve() endpoint
  research/
    start/route.ts        ← POST: create research_job + fire event
    status/route.ts       ← GET:  poll progress
  fetch-intel/route.ts    ← GET:  SerpAPI news refresh (existing)

components/
  ResearchJobStatus.tsx   ← progress bar + phase pills
  CompanyProfile.tsx      ← funding, founders, investors UI
  ResearchPapers.tsx      ← papers + patents with relevance scores

supabase/
  migration_research.sql  ← all new tables + RLS + indexes

docs/architecture/
  README.md               ← this file
  inngest-research-pipeline.md
  gcp-extension-guide.md
```

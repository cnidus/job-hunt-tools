# CLAUDE.md — Job Hunt Tools (clockwork-tracker)

Quick-start reference for AI sessions and new contributors. Read this before touching any code.

---

## What this is

A personal job-tracking and research app built for Doug Youd's job search. It combines a kanban-style job pipeline with an automated research agent that digs up company intel, founders, funding, academic papers, and patents for each role he's interviewing for.

Live at: **https://job-hunt-tools.vercel.app**  
GitHub: **https://github.com/cnidus/job-hunt-tools**  
Supabase project: `gwnnaafrbsszyviimnfc`  
Vercel org/team: `doug-youds-projects` (team ID: `team_wYMi2YeKNO6AkFTezIgp2YVC`)

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Styling | Tailwind CSS |
| Auth | Supabase Auth — Google OAuth only |
| Database | Supabase Postgres (RLS on every table) |
| Background jobs | Inngest (durable step functions, free tier) |
| AI synthesis | Anthropic Claude Haiku (P5 only) |
| Company intel | SerpAPI Knowledge Graph + related_questions + Wikipedia REST |
| News | SerpAPI Google News |
| Papers | Semantic Scholar (free API) |
| Patents | SerpAPI Google Patents |
| Hosting | Vercel (auto-deploys on push to `main`) |

---

## Repo layout

```
clockwork-tracker/
├── app/
│   ├── page.tsx                  # Jobs overview (list of all tracked jobs)
│   ├── login/page.tsx            # Google OAuth login page
│   ├── auth/callback/route.ts    # Supabase OAuth callback handler
│   ├── jobs/[id]/page.tsx        # Per-job hub (6 tabs)
│   └── api/
│       ├── inngest/route.ts      # Inngest serve endpoint (GET/POST/PUT)
│       ├── fetch-intel/route.ts  # Fetches news intel for a job
│       ├── research/
│       │   ├── start/route.ts    # POST — triggers research pipeline
│       │   └── status/route.ts   # GET  — polls research_jobs row
├── components/
│   ├── Header.tsx                # Top nav, job status chips
│   ├── JobCard.tsx               # Card on jobs overview
│   ├── AddJobModal.tsx           # Modal to add a new job
│   ├── JobHub.tsx                # 6-tab hub: feed/tasks/mastery/notes/company/research
│   ├── IntelFeed.tsx             # News intel tab
│   ├── IntelItemCard.tsx         # Single news item card
│   ├── DailyTasks.tsx            # Daily prep task checklist
│   ├── MasteryChecklist.tsx      # Skills mastery tracker
│   ├── ResearchNotes.tsx         # Freeform notes tab
│   ├── ResearchJobStatus.tsx     # Research pipeline progress (phase pills)
│   ├── CompanyProfile.tsx        # Company snapshot, funding, people
│   └── ResearchPapers.tsx        # Papers + patents with relevance filter
├── inngest/
│   ├── client.ts                 # Inngest client (id: 'job-tracker')
│   └── research-agent.ts         # 5-phase research pipeline function
├── lib/
│   ├── types.ts                  # All TypeScript types + UI helpers
│   ├── storage.ts                # All Supabase data access (no raw queries elsewhere)
│   └── supabase.ts               # Supabase client factory
├── middleware.ts                 # Auth guard — redirects unauthenticated users to /login
├── supabase/
│   ├── migration_auth.sql        # Auth + RLS setup
│   ├── migration_jobs.sql        # jobs, intel_items, user_actions, daily_tasks, mastery_*
│   ├── migration_research.sql    # research_jobs, company_*, research_papers, patents + RPC
│   └── schema.sql                # Full schema reference (informational)
└── docs/architecture/
    ├── README.md                 # Stack, data model, key decisions
    ├── inngest-research-pipeline.md  # Phase-by-phase breakdown, retry table, cost model
    └── gcp-extension-guide.md    # Guide for future GCP/BigQuery extension
```

---

## Database schema (quick reference)

All tables have RLS. The `jobs` table is the root — everything else has a `job_id` FK to it.

```
jobs                          — one row per tracked role
├── intel_items               — news articles fetched for the job
├── user_actions              — read/bookmark state per item per user
├── daily_tasks               — prep checklist items per day
├── mastery_items             — shared skill templates (read-only)
├── mastery_completions       — per-user completion state
├── research_notes            — freeform notes
├── research_jobs             — one row per pipeline run; tracks status + phases_complete[]
├── company_profiles          — 1:1 company snapshot (description, funding, CEO, etc.)
├── company_entities          — founders, execs, advisors with LinkedIn URLs
├── company_investors         — funding rounds and investors
├── research_papers           — Semantic Scholar results with relevance scoring
└── patents                   — Google Patents results with relevance scoring
```

SQL migrations must be applied in order: `migration_auth` → `migration_jobs` → `migration_research`.  
To apply: use the Supabase Management API (`POST /v1/projects/{ref}/database/query`) with a personal access token, or paste into the Supabase SQL editor.

---

## Research pipeline (Inngest)

Function ID: `research-agent`  
Trigger event: `research/job.created`  
Retries: 2 (each failed step retries from that step, not from scratch)

| Phase | Step ID | What it does | APIs |
|---|---|---|---|
| P1 | `p1_company` | Company overview, founders, funding | SerpAPI KG + related_questions, Wikipedia, Crunchbase (optional) |
| P2 | `p2_entities` | LinkedIn URL discovery per entity | SerpAPI Google (`site:linkedin.com/in`) |
| P3 | `p3_research` | Academic papers + patents | Semantic Scholar, SerpAPI Patents |
| P4 | `p4_news` | Refresh news articles | SerpAPI Google News |
| P5 | `p5_synthesis` | Score + annotate papers/patents | Anthropic Claude Haiku |

Progress is tracked in `research_jobs.phases_complete[]` via the `append_phase_complete` Postgres RPC (idempotent).  
Frontend polls `GET /api/research/status?job_id=<id>` every 5s until `status` is `complete` or `failed`.

**Cost per run:** ~$0.08–0.15 (Claude Haiku, capped at 30 items). P1–P4 use SerpAPI credits only.

---

## Environment variables

| Variable | Where set | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel + local | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel + local | Supabase anon key (public) |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel only | Service role key for Inngest agent writes (bypasses RLS) |
| `SERP_API_KEY` | Vercel only | SerpAPI key for all Google searches |
| `ANTHROPIC_API_KEY` | Vercel only | Claude Haiku for P5 synthesis |
| `INNGEST_EVENT_KEY` | Vercel (auto) | Injected by Inngest Vercel integration |
| `INNGEST_SIGNING_KEY` | Vercel (auto) | Injected by Inngest Vercel integration |
| `CRUNCHBASE_API_KEY` | Vercel (optional) | Enables Crunchbase fallback in P1 |

Local dev: copy `.env.local.example` → `.env.local` and fill in Supabase URL + anon key. SerpAPI/Anthropic/Inngest keys are not needed locally unless testing the research pipeline.

---

## Key patterns to preserve

**All data access goes through `lib/storage.ts`** — never query Supabase directly in components or API routes. Add new fetch/mutate functions there.

**Inngest agent uses `supabaseAdmin`** (service role) — this bypasses RLS so the background job can write to any user's rows. Never use the anon client in `inngest/research-agent.ts`.

**Deduplication keys** — entities use `{job_id}:{lower(name)}`, papers use `ss:{paperId}`, patents use `patent:{id}` or `title:{slug}`. Always upsert on `dedup_key`, never plain insert.

**`onFailure` handler shape** — in Inngest's `onFailure`, the original event is nested at `event.data.event.data`, not `event.data`. Access it as:
```typescript
const originalData = (event.data as unknown as { event?: { data?: { researchJobId?: string } } }).event?.data
```

**Git workflow** — push to `main` on `github.com/cnidus/job-hunt-tools`. Vercel auto-deploys. Never deploy directly to Vercel, always go through GitHub.

---

## Local dev

```bash
cd clockwork-tracker
npm install
cp .env.local.example .env.local   # fill in SUPABASE_URL + ANON_KEY
npm run dev                          # http://localhost:3000
```

The app requires a logged-in Supabase user (Google OAuth). You'll be redirected to `/login` if unauthenticated.

To test the research pipeline locally, you also need `SERP_API_KEY`, `ANTHROPIC_API_KEY`, and a running Inngest dev server (`npx inngest-cli@latest dev`).

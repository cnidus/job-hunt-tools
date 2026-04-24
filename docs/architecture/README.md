# Architecture Overview

## System diagram

```
Browser
  │
  ├─► Next.js 15 App (Vercel)
  │     ├── App Router (server components + client components)
  │     ├── middleware.ts  — Supabase SSR auth gate
  │     └── /api/*        — API routes
  │           ├── /inngest        ← Inngest webhook (PUBLIC — no auth)
  │           ├── /research/start ← Creates job + fires Inngest event
  │           ├── /research/status← Poll pipeline progress
  │           ├── /fetch-intel    ← News + blog fetcher (manual or cron)
  │           ├── /profile/*      ← User profile CRUD + Proxycurl + PDF upload
  │           └── /admin/*        ← Admin-only job management
  │
  ├─► Supabase (Postgres + Auth + RLS)
  │     ├── auth.users             — Google OAuth users
  │     ├── jobs                   — Job listings per user
  │     ├── research_jobs          — Pipeline runs (status, phases, gap_analysis)
  │     ├── company_profiles       — P1 output
  │     ├── company_entities       — Founders, CEOs, etc.
  │     ├── company_investors      — Funding rounds
  │     ├── research_papers        — Semantic Scholar results
  │     ├── patents                — Google Patents results
  │     ├── intel_items            — News / blog articles
  │     ├── daily_tasks            — Per-job daily checklist
  │     ├── mastery_items          — Skill checklist items
  │     ├── mastery_completions    — Per-user per-job completions
  │     ├── research_notes         — Free-form notes
  │     └── user_profiles          — LinkedIn/resume data + parsed_profile JSON
  │
  ├─► Inngest Cloud
  │     └── research-agent function (6 durable phases)
  │           P1 → P2 → P3 → P4 → P5 → P6
  │
  └─► External APIs
        ├── SerpAPI      — Google KG, News, Patents, LinkedIn search
        ├── Semantic Scholar — Academic papers
        ├── Proxycurl    — LinkedIn profile structured data
        ├── Anthropic    — Claude Opus (P5 synthesis + P6 gap analysis + PDF parse)
        └── Crunchbase   — Optional company data enrichment
```

## Data flow: research run

```
User clicks "Start Research"
  → POST /api/research/start
  → Creates research_jobs row (status: pending)
  → inngest.send("research/job.created", { jobId, researchJobId })
  → Returns { ok: true }

Frontend polls GET /api/research/status every 5s

Inngest picks up event:
  P1: fetchCompanyIntelligence()
      → SerpAPI Google search (KG + organic + related questions)
      → Strict KG validation (title must contain company core name)
      → Dedicated CEO organic search
      → Wikipedia TLD fallback
      → Crunchbase (if key configured)
      → Writes to company_profiles, company_investors
      → marks p1_company complete

  P2: enrichEntitiesWithLinkedIn()
      → SerpAPI site:linkedin.com/in search per entity
      → Updates company_entities with linkedin_url
      → marks p2_entities complete

  P3: fetchPapersForEntities() + fetchPatentsForEntities()
      → Semantic Scholar author search + paper fetch
      → SerpAPI Google Patents per entity
      → Writes to research_papers, patents
      → marks p3_research complete

  P4: fetchNewsInternal()
      → SerpAPI Google News for company + role
      → Deduplicates by URL
      → Writes to intel_items
      → marks p4_news complete

  P5: claudeSynthesis()
      → Claude Opus scores each paper/patent 0-1
      → Assigns relevance_category + relevance_note
      → Updates research_papers, patents
      → marks p5_synthesis complete

  P6: runGapAnalysis()
      → Loads user_profiles for job owner
      → If no profile → skip gracefully
      → Claude Opus: user profile vs JD → structured gap analysis JSON
      → Writes to research_jobs.gap_analysis
      → marks p6_gap_analysis complete

  → research_jobs status: complete
```

## Data flow: profile import

```
Via Proxycurl:
  POST /api/profile/scrape { linkedin_url }
  → Proxycurl API → structured JSON
  → Normalise to parsed_profile shape
  → Flatten to resume_text
  → Upsert user_profiles

Via PDF upload:
  POST /api/profile/upload (multipart)
  → Read file bytes
  → Claude Opus: document block → extract to JSON schema
  → Flatten to resume_text
  → Upsert user_profiles
```

## Auth model

- Google OAuth via Supabase Auth
- Middleware gates all routes except `/login`, `/auth/*`, `/_next/*`, `/api/inngest`
- Row Level Security on all tables: users can only read/write their own data
- Admin routes additionally check `user.email === 'douglasyoud@gmail.com'`
- Service role client used server-side to bypass RLS for cross-user admin ops

## See also

- [Inngest Research Pipeline](./inngest-research-pipeline.md) — detailed phase docs
- [GCP Extension Guide](./gcp-extension-guide.md) — future cloud extension notes

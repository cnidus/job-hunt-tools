# Architecture Overview

## Stack

| Layer         | Technology                         |
|---------------|------------------------------------|
| Frontend      | Next.js 15 (App Router), Tailwind  |
| Auth          | Supabase Auth (Google OAuth)       |
| Database      | Supabase Postgres (RLS enabled)    |
| Background    | Inngest (durable step functions)   |
| AI Synthesis  | Anthropic Claude (Haiku)           |
| News & Search | SerpAPI (Google News + KG + Patents)|
| Papers        | Semantic Scholar (free API)        |
| Company Info  | SerpAPI KG + Wikipedia REST        |
| Hosting       | Vercel                             |

## Data model

```
jobs
├── intel_items        (news articles)
├── user_actions       (read/bookmark state)
├── daily_tasks        (prep tasks per day)
├── mastery_completions
├── research_notes
├── research_jobs      (pipeline run tracking)
├── company_profiles   (1:1 per job)
├── company_entities   (founders, execs)
├── company_investors
├── research_papers    (Semantic Scholar)
└── patents            (Google Patents via SerpAPI)
```

## Key architectural decisions

### Inngest for background research
Edge functions time out at 150s. Research runs take 3–8 minutes. Inngest provides
durable step functions with automatic retries and checkpointing, so a failure in P3
resumes from P3 — not from scratch.

### Phase-based pipeline with single Claude call
Early designs called Claude at each phase (expensive: ~$1.50–3/run). Current design
calls Claude once in P5 with pre-structured data from P1–P4. Cost: ~$0.08–0.15/run.

### Multi-source company intelligence (P1)
Crunchbase requires a paid API. P1 instead uses:
1. SerpAPI Google search — Knowledge Graph panel (established companies)
2. SerpAPI related_questions — funding/founder/CEO facts from Google snippets
3. Wikipedia REST API — description for notable companies
4. Crunchbase (optional, if `CRUNCHBASE_API_KEY` is set)

### Frontend polling
The frontend polls `/api/research/status` every 5s while a run is pending/running.
Progress is stored in `research_jobs.phases_complete[]` (an array appended by the
`append_phase_complete` Postgres RPC) so any poll sees current state.

See also:
- [inngest-research-pipeline.md](./inngest-research-pipeline.md)
- [gcp-extension-guide.md](./gcp-extension-guide.md)

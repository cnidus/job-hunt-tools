# Inngest Research Pipeline

## Overview

The research pipeline runs as a single Inngest function (`research-agent`) with **6 durable phases**.
Each phase is a `step.run()` call — Inngest checkpoints after each one, so retries resume from
the last incomplete step rather than restarting the whole run.

Triggered by the `research/job.created` event, fired from `POST /api/research/start`.

## Phases

| Phase | Step ID | What it does | APIs used |
|-------|---------|-------------|-----------|
| P1 | `p1-company-intelligence` | Company overview, founders, CEO, funding, HQ | SerpAPI (KG + organic + related questions), Wikipedia, Crunchbase (opt) |
| P2 | `p2-entity-enrichment` | LinkedIn URL discovery per entity | SerpAPI Google (`site:linkedin.com/in`) |
| P3 | `p3-research` | Academic papers + company patents | Semantic Scholar, SerpAPI Google Patents |
| P4 | `p4-news` | Refresh news articles | SerpAPI Google News |
| P5 | `p5-synthesis` | Claude scores + annotates papers/patents for interview relevance | Anthropic Claude Opus |
| P6 | `p6-gap-analysis` | Diff user profile vs JD — match score, skill radar, study plan, talking points | Anthropic Claude Opus |

## Phase 1 detail: KG validation

Google's Knowledge Graph may return the wrong company for ambiguous names.
The pipeline validates: `kgCore.includes(companyCore)` where both strings have TLD and legal suffixes stripped.

```typescript
const strip = (s: string) =>
  s.replace(/\.[a-z]{2,}$/i, '')           // remove .io, .ai, .com
   .replace(/\b(inc|corp|llc|ltd|co\.?)\b/gi, '')
   .replace(/\s+/g, ' ').trim().toLowerCase()

// KG is valid only if its title CONTAINS the full company core name
const kgIsValid = kgCore.includes(companyCore)
```

CEO/founder data is intentionally **never pulled from the KG**. A dedicated organic search
`"CompanyName" CEO OR founder` runs separately to avoid KG mis-attribution to a different entity.

## Phase 6 detail: Gap analysis

P6 loads the job owner's `user_profiles` row, then calls Claude with:
- The job's `role_title`, `company_name`, and `notes` (job description)
- The company `description` saved in P1
- The user's flattened `resume_text`

Claude returns structured JSON written to `research_jobs.gap_analysis`:

```json
{
  "match_score": 78,
  "skill_radar": [{ "skill": "Kubernetes", "user_level": 3, "required_level": 5 }],
  "study_topics": [
    { "topic": "...", "priority": "high", "reason": "...", "resources": ["..."] }
  ],
  "strengths": [{ "area": "...", "detail": "..." }],
  "talking_points": [{ "requirement": "...", "talking_point": "...", "evidence": "..." }],
  "generated_at": "2026-04-24T..."
}
```

If no user profile exists, P6 skips silently and `gap_analysis` stays `null`.

## Checkpoint pattern

```sql
-- append_phase_complete RPC (idempotent — won't double-append)
UPDATE research_jobs
SET    phases_complete = array_append(phases_complete, p_phase),
       updated_at      = now()
WHERE  id = p_research_job_id
  AND  NOT (p_phase = ANY(phases_complete));
```

Frontend polls `GET /api/research/status?job_id=<id>` every 5s.
Poll stops when `status` is `complete` or `failed`.

## Retry table

| Phase | Common failure mode | Inngest retry behaviour |
|-------|--------------------|-----------------------|
| P1 | SerpAPI rate-limit, wrong KG entity | Step retried from P1 |
| P2 | LinkedIn search timeout | Step retried from P2 |
| P3 | Semantic Scholar 429 (has 400ms delays) | Step retried from P3 |
| P4 | SerpAPI quota exhausted | Step retried from P4 |
| P5 | Anthropic timeout / JSON parse fail | Step retried from P5 |
| P6 | No user profile → skips gracefully | N/A |

Function-level retries: 2 (via `retries: 2`).
On permanent failure, `onFailure` hook writes `error_message` to `research_jobs` and sets `status: 'failed'`.

## Trigger patterns

| Trigger | How |
|---------|-----|
| Manual | `POST /api/research/start` |
| Re-run | Same endpoint; previous run must be `complete` or `failed` |
| Material event | `detectMaterialEvent()` in `fetch-intel` route → `inngest.send()` |

## Critical: middleware public path

`/api/inngest` **must** be in the `isPublic` list in `middleware.ts`.
Inngest Cloud pushes events via HTTP POST — if the route is auth-gated, all requests
get redirected to `/login` and Inngest can't sync or deliver events.

```typescript
const isPublic =
  pathname.startsWith('/login') ||
  pathname.startsWith('/auth') ||
  pathname.startsWith('/_next') ||
  pathname.startsWith('/favicon') ||
  pathname.startsWith('/api/inngest') // ← Inngest must be publicly reachable
```

## Cost model (per research run)

| Phase | Cost |
|-------|------|
| P1–P4 | SerpAPI credits (varies by plan) |
| P5 | Claude Opus ~$0.10–0.20 (capped at 30 items) |
| P6 | Claude Opus ~$0.05–0.10 |
| Proxycurl (profile import, one-time) | ~$0.01 per profile |
| Inngest | Free tier: 100K function-steps/month |

## Environment variables

```
NEXT_PUBLIC_SUPABASE_URL          — Supabase project URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY — Supabase anon/publishable key
SUPABASE_SERVICE_ROLE_KEY         — Supabase service role (bypasses RLS)
ANTHROPIC_API_KEY                 — Claude API
INNGEST_EVENT_KEY                 — Auto-injected by Inngest Vercel integration
INNGEST_SIGNING_KEY               — Auto-injected by Inngest Vercel integration
SERP_API_KEY                      — SerpAPI (P1–P4)
PROXYCURL_API_KEY                 — LinkedIn profile import (optional)
CRUNCHBASE_API_KEY                — Crunchbase fallback in P1 (optional)
```

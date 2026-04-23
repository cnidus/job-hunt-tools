# Inngest Research Pipeline

## Overview

The research pipeline runs as a single Inngest function (`research-agent`) with 5 durable phases.
Each phase is a `step.run()` call — Inngest checkpoints after each one, so retries resume from
the last incomplete step rather than restarting the whole run.

## Phases

| Phase | ID              | What it does                                  | APIs used                          |
|-------|-----------------|-----------------------------------------------|------------------------------------|
| P1    | p1_company      | Company overview, founders, funding           | SerpAPI (KG + RQ), Wikipedia, Crunchbase (opt) |
| P2    | p2_entities     | LinkedIn URL discovery per entity             | SerpAPI Google (`site:linkedin.com/in`) |
| P3    | p3_research     | Academic papers + patents                     | Semantic Scholar, SerpAPI Patents  |
| P4    | p4_news         | Refresh news articles                         | SerpAPI Google News                |
| P5    | p5_synthesis    | Claude scores + annotates papers/patents       | Anthropic Claude Haiku             |

## Checkpoint pattern

```sql
-- append_phase_complete RPC (idempotent)
UPDATE research_jobs
SET    phases_complete = array_append(phases_complete, p_phase),
       updated_at      = now()
WHERE  id = p_research_job_id
  AND  NOT (p_phase = ANY(phases_complete));
```

Frontend polls `GET /api/research/status?job_id=<id>` every 5s.
Poll stops when `status` is `complete` or `failed`.

## Retry table

| Phase | Failure mode                    | Inngest retry behavior     |
|-------|---------------------------------|----------------------------|
| P1    | SerpAPI rate-limit or Wikipedia 404 | Step retried from P1   |
| P2    | LinkedIn search timeout         | Step retried from P2       |
| P3    | Semantic Scholar 429            | Step retried from P3 (has 400ms delays) |
| P4    | SerpAPI quota exhausted         | Step retried from P4       |
| P5    | Anthropic timeout / JSON parse  | Step retried from P5 only  |

Function-level retries: 2 (configurable via `retries` option).
On permanent failure, `onFailure` hook writes `error_message` to `research_jobs`.

## Trigger patterns

| Trigger          | How                                      |
|------------------|------------------------------------------|
| Manual           | POST `/api/research/start`               |
| Re-run           | Same endpoint; previous run must be complete/failed |
| Material event   | `detectMaterialEvent()` in fetch-intel route → Inngest send |
| Scheduled weekly | (future) Inngest cron `{ cron: '0 9 * * 1' }` |

## Cost model

- P1–P4: ~$0 (SerpAPI paid plan) or SerpAPI credit use
- P5: Claude Haiku ~$0.08–0.15 per run (capped at 30 items)
- Inngest free tier: 100K function runs/month

## Environment variables required

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
SERP_API_KEY
ANTHROPIC_API_KEY
INNGEST_EVENT_KEY         (auto-injected by Inngest Vercel integration)
INNGEST_SIGNING_KEY       (auto-injected by Inngest Vercel integration)
CRUNCHBASE_API_KEY        (optional — enables Crunchbase fallback in P1)
```

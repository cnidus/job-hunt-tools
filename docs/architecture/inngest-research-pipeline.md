# Inngest Research Pipeline

## Overview

The research pipeline is a 5-phase Inngest function (`inngest/research-agent.ts`).
Each phase is wrapped in `step.run()` — if the function fails mid-run, Inngest
checkpoints completed steps and resumes from the last incomplete one on retry.
Progress is also written to `research_jobs.phases_complete` (a text[] column) so
the frontend can show granular status even across retries.

## Phases

### P1 — Crunchbase Discovery (~20s, no Claude)

Fetches structured company data from Crunchbase Basic API:
- company description, employee count, founding year
- total funding, last round type + date
- LinkedIn/Twitter links
- founders list (best-effort — Basic tier may not return this)

Writes to: `company_profiles`

Fallback: if Crunchbase returns no match, the phase succeeds gracefully with
`crunchbaseData = null`. P2 will fall back to SerpAPI founder search.

### P2 — Entity Enrichment (~30s, no Claude)

For each founder found in P1 (or discovered via SerpAPI fallback), searches for their
LinkedIn profile URL using SerpAPI Google Search (`site:linkedin.com/in`).

Writes to: `company_entities` (with `dedup_key = {job_id}:{lower(name)}`)

Rate-limiting: capped at 5 entities to avoid SerpAPI quota burn.

### P3 — Research Scrape (~60–90s, no Claude)

Two parallel fetches:

**Semantic Scholar** (free API, no key):
- Author search by entity name
- Fetch top 10 papers per author
- Fields: title, year, abstract, citation count, DOI, URL
- Dedup key: `doi:{DOI}` or `title:{normalized_title}`
- Rate limit: 400ms delay between authors (100 req/5min unkeyed)

**SerpAPI Google Patents**:
- Query: `inventor:"{name}" assignee:"{company}"`
- Fields: title, patent number, filing/grant date, abstract, URL
- Capped at 3 entities × 5 patents

Writes to: `research_papers`, `patents`

### P4 — News Refresh (~20s, no Claude)

Inline reimplementation of the existing `fetch-intel` logic (avoids HTTP self-call).
4 SerpAPI Google News queries:
1. `"company name"`
2. `"company name" role title`
3. `"company name" funding news`
4. `"company name" product launch`

Writes to: `intel_items` (dedup by URL per job)

### P5 — Claude Synthesis (~15s, **1 Claude call**)

Single `anthropic.messages.create()` call with all papers and patents (capped at 30
items to bound cost and context length).

Claude assigns for each item:
- `relevance_category`: `core_to_company | relevant_to_role | tangential | not_relevant`
- `relevance_score`: float 0.00–1.00
- `relevance_note`: 1–2 sentences with interview-actionable insight for high-score items

Claude responds with a JSON array. Scores are written back to `research_papers` and
`patents` rows.

**Approximate cost**: 8K input tokens + 3K output ≈ $0.07–0.12 per run at
`claude-sonnet-4-5` pricing.

## Retry and failure handling

| Phase | Retry strategy | DLQ trigger |
|-------|---------------|-------------|
| P1 Crunchbase | Inngest retries whole step (max 2×). Rate limit → exponential backoff | After 2 failures, mark `phases_complete` stops here |
| P2 Entity | Per-entity try/catch. One entity failure doesn't block others | Only if ALL entities fail |
| P3 Research | Per-entity try/catch, separate for papers + patents | Partial results stored even on failure |
| P4 News | Per-query try/catch | Empty result is valid |
| P5 Synthesis | JSON parse failure → non-fatal, research data stored unscored | After 2 failures, step skipped |
| Any phase | Unhandled exception | `onFailure` handler sets `research_jobs.status = 'failed'` |

Inngest's built-in retry + `onFailure` handler (defined in `inngest.createFunction`)
writes the error message to `research_jobs.error_message` for display in the UI.

## Checkpoint/resume

`research_jobs.phases_complete` is a `text[]` column appended to after each phase
succeeds (via the `append_phase_complete` Postgres function).

On an Inngest retry, already-completed `step.run()` blocks are **not re-executed** by
Inngest (it replays the stored result). This means API calls in completed phases are
not repeated, protecting rate limits and cost.

## Triggering the pipeline

### On job add (AddJobModal.tsx)

```typescript
await fetch('/api/research/start', {
  method: 'POST',
  body: JSON.stringify({ job_id, trigger: 'job_added' }),
})
```

### Weekly refresh (Vercel cron)

Add to `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/research/weekly-refresh",
    "schedule": "0 8 * * 1"
  }]
}
```

The weekly refresh route iterates all jobs where `last_crunchbase_fetch < 7 days ago`
and fires a `research/job.created` event per job with `trigger: 'weekly'`.

### Intel-triggered refresh

After every `fetch-intel` call, scan new intel items with `detectMaterialEvent()`:
```typescript
import { detectMaterialEvent } from '@/inngest/research-agent'
if (newItems.some(i => detectMaterialEvent(i.title, i.summary))) {
  await fetch('/api/research/start', {
    method: 'POST',
    body: JSON.stringify({ job_id, trigger: 'intel_triggered' }),
  })
}
```

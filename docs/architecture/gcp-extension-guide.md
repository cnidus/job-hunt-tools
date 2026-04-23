# GCP Extension Guide

## When to consider migrating from Inngest

The current Inngest implementation covers all requirements for personal use
(~5–20 jobs, weekly refreshes). Consider GCP when:

- Research pipelines exceed 15 minutes (Inngest function limit on free tier)
- You want to add Vertex AI for embeddings / semantic similarity search
- You need BigQuery for analytics over research data
- You want native GCP alerting (Cloud Monitoring) for pipeline failures
- You need more than 100K Inngest function runs/month

## Target GCP architecture

```
Vercel (frontend)
  ↓ POST /api/research/start (creates research_jobs row)
  ↓ Publishes message to Cloud Pub/Sub topic

Cloud Pub/Sub topic: research-jobs
  → Subscription: research-worker-sub
  → Dead Letter Topic: research-jobs-dlq (after 3 failed deliveries)

Cloud Run service: research-worker
  ← Pulls from research-worker-sub (push subscription)
  ↓ Runs 5-phase pipeline (same logic as inngest/research-agent.ts)
  ↓ Writes to Supabase directly (same supabaseAdmin client)

Cloud Scheduler job (weekly-research-refresh)
  cron: "0 8 * * 1"
  → Publishes batch messages for each job needing refresh

Cloud Monitoring alert
  → Fires when research-jobs-dlq has undelivered messages
```

## Migration steps

### 1. Create GCP project and enable APIs

```bash
gcloud projects create job-tracker-research
gcloud config set project job-tracker-research

gcloud services enable \
  run.googleapis.com \
  pubsub.googleapis.com \
  cloudscheduler.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com
```

### 2. Create Pub/Sub infrastructure

```bash
# Main topic
gcloud pubsub topics create research-jobs

# Dead letter topic
gcloud pubsub topics create research-jobs-dlq

# Subscription with retry + DLQ
gcloud pubsub subscriptions create research-worker-sub \
  --topic=research-jobs \
  --push-endpoint=https://research-worker-XXXX.run.app/process \
  --ack-deadline=600 \
  --max-delivery-attempts=3 \
  --dead-letter-topic=research-jobs-dlq \
  --min-retry-delay=30s \
  --max-retry-delay=300s
```

### 3. Dockerize the worker

Create `research-worker/Dockerfile`:
```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build
EXPOSE 8080
CMD ["node", "dist/server.js"]
```

Create `research-worker/server.ts`:
```typescript
import express from 'express'
import { runResearchPipeline } from './pipeline'  // same logic as research-agent.ts

const app = express()
app.use(express.json())

// Cloud Run receives Pub/Sub push messages here
app.post('/process', async (req, res) => {
  const message = req.body.message
  const data = JSON.parse(Buffer.from(message.data, 'base64').toString())
  const { jobId, researchJobId } = data

  // Ack immediately — processing happens async
  res.sendStatus(204)

  try {
    await runResearchPipeline(jobId, researchJobId)
  } catch (err) {
    console.error('Pipeline failed:', err)
    // Supabase error state is written inside runResearchPipeline's finally block
    // Cloud Run returning 2xx already acked the message, so DLQ won't trigger here.
    // For DLQ to fire, let the HTTP handler return 4xx/5xx instead.
  }
})

app.listen(8080)
```

### 4. Deploy to Cloud Run

```bash
gcloud run deploy research-worker \
  --source ./research-worker \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 512Mi \
  --timeout 900 \
  --set-env-vars "NEXT_PUBLIC_SUPABASE_URL=...,SUPABASE_SERVICE_ROLE_KEY=...,..." \
  --max-instances 5
```

### 5. Replace the Inngest event in Vercel

In `app/api/research/start/route.ts`, swap the Inngest send for a Pub/Sub publish:

```typescript
// Remove:
import { inngest } from '@/inngest/client'
await inngest.send({ name: 'research/job.created', data: { jobId, researchJobId } })

// Replace with:
import { PubSub } from '@google-cloud/pubsub'
const pubsub = new PubSub({ projectId: process.env.GCP_PROJECT_ID })
await pubsub.topic('research-jobs').publishMessage({
  json: { jobId, researchJobId }
})
```

### 6. Weekly cron via Cloud Scheduler

```bash
gcloud scheduler jobs create pubsub weekly-research-refresh \
  --schedule="0 8 * * 1" \
  --topic=research-jobs-weekly \
  --message-body='{"trigger":"weekly"}' \
  --time-zone="America/New_York"
```

The research worker handles the `trigger: 'weekly'` message by querying Supabase for
all jobs with `last_crunchbase_fetch < 7 days ago` and running P1+P2 only.

## GCP free tier limits (as of 2025)

| Service | Free allowance | Est. usage | Cost |
|---------|---------------|------------|------|
| Cloud Run | 2M req/mo · 360K vCPU-s/mo | ~200 req/mo | $0 |
| Cloud Pub/Sub | 10GB data/mo | <1MB | $0 |
| Cloud Tasks | 1M tasks/mo | N/A (using Pub/Sub) | $0 |
| Cloud Scheduler | $0.10/job/mo | 1 job | $0.10 |
| Artifact Registry | 0.5GB free | ~200MB image | $0 |
| **Total** | | | **~$0.10/mo** |

Note: Cloud Scheduler is NOT free tier — it costs $0.10/job/month. Budget ~$1.20/year.

## Key differences from Inngest

| Feature | Inngest | GCP Cloud Run + Pub/Sub |
|---------|---------|------------------------|
| Step-level retry | Native (`step.run()`) | Must implement manually or use `phases_complete` checkpoint |
| DLQ | Built-in | Cloud Pub/Sub dead letter topic |
| Dashboard | `app.inngest.com` | Cloud Console + Cloud Monitoring |
| Setup time | ~20 min | ~2–3 hours |
| Cold start | None (serverless JS) | ~1–2s (Cloud Run) |
| Max function duration | 15 min (free) | 60 min (Cloud Run default) |
| Infra ownership | Managed SaaS | Full GCP ownership |
| Language | TypeScript (same repo) | Any language (Docker) |

## Checkpoint implementation for GCP

Since GCP Cloud Run doesn't have Inngest's step checkpointing, implement it manually:

```typescript
async function runResearchPipeline(jobId: string, researchJobId: string) {
  // Read current checkpoint
  const { data: rJob } = await supabaseAdmin
    .from('research_jobs')
    .select('phases_complete')
    .eq('id', researchJobId)
    .single()

  const done = new Set(rJob?.phases_complete ?? [])

  if (!done.has('p1-discovery')) {
    await runP1(jobId, researchJobId)
  }
  if (!done.has('p2-entity-enrichment')) {
    await runP2(jobId, researchJobId)
  }
  // ... etc
}
```

This is equivalent to Inngest's step.run() checkpointing but explicit.

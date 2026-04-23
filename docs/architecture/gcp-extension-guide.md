# GCP Extension Guide

This document describes how to migrate the background research pipeline from Inngest
to Google Cloud Platform if scale or cost requires it. Inngest is recommended for
the current scale (single-user to small teams). Use this as a reference if you
outgrow it.

## When to consider GCP

- Inngest pricing becomes prohibitive (>1M runs/month)
- You need custom DLQ handling or SLA guarantees beyond Inngest's free tier
- You want to colocate with other GCP infrastructure

## Comparable GCP architecture

```
Vercel (Next.js)
   └─ POST /api/research/start
         └─ Publish to Cloud Pub/Sub topic "research-jobs"
                └─ Cloud Run job "research-agent" (subscribes, runs pipeline)
                      └─ Writes results to Supabase (same as today)
```

## Free tier limits (2024)

| Service         | Free tier                          |
|-----------------|------------------------------------|
| Cloud Pub/Sub   | 10 GB/month messaging              |
| Cloud Run       | 2M requests/month, 360K vCPU-s     |
| Cloud Scheduler | 3 jobs/month                       |
| Cloud Storage   | 5 GB (for logs/DLQ)                |

At current volume (1–10 research runs/day), all components stay within free tier.

## Migration steps

### 1. Create Pub/Sub topic and subscription

```bash
gcloud pubsub topics create research-jobs
gcloud pubsub subscriptions create research-jobs-sub \
  --topic=research-jobs \
  --ack-deadline=600 \
  --message-retention-duration=7d
```

### 2. Containerise the research agent

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY . .
RUN npm ci
CMD ["node", "dist/inngest/research-agent-worker.js"]
```

The worker listens to Pub/Sub push or pull, calls the same phase functions,
and writes to Supabase via the service-role key.

### 3. Deploy to Cloud Run

```bash
gcloud run deploy research-agent \
  --image gcr.io/PROJECT/research-agent \
  --platform managed \
  --region us-central1 \
  --set-env-vars SUPABASE_URL=...,SERP_API_KEY=...,ANTHROPIC_API_KEY=...
```

### 4. Replace Inngest send with Pub/Sub publish in /api/research/start

```typescript
import { PubSub } from '@google-cloud/pubsub'
const pubsub = new PubSub()
await pubsub.topic('research-jobs').publishMessage({
  data: Buffer.from(JSON.stringify({ jobId, researchJobId }))
})
```

### 5. DLQ

Configure a dead-letter topic on the subscription:

```bash
gcloud pubsub subscriptions modify-push-config research-jobs-sub \
  --dead-letter-topic=research-jobs-dlq \
  --max-delivery-attempts=5
```

Monitor dead-letter messages in Cloud Console or set up a Cloud Function alert.

## Tradeoffs vs Inngest

| Aspect              | Inngest                       | GCP Pub/Sub + Cloud Run         |
|---------------------|-------------------------------|---------------------------------|
| Setup complexity    | Low (Vercel integration)      | Medium (GCP project, IAM, etc.) |
| Step checkpointing  | Built-in                      | Manual (same phases_complete pattern) |
| DLQ                 | Built-in                      | Configure dead-letter topic     |
| Cost at low volume  | Free tier generous            | Effectively free                |
| Cost at scale       | Paid plans ~$100+/mo          | Pay-per-use, usually cheaper    |
| Vendor lock-in      | Moderate                      | Low (standard Pub/Sub interface)|
| Observability       | Inngest dashboard             | Cloud Logging + Monitoring      |

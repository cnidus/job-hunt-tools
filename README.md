# Job Hunt Research Hub

A full-stack AI-powered job research and interview prep platform. Add jobs you're pursuing, trigger a deep research pipeline on each one, and get personalized gap analysis comparing your background against the role.

**Live at:** [job-hunt-tools.vercel.app](https://job-hunt-tools.vercel.app)

---

## Features

| Tab | What it does |
|-----|-------------|
| 📰 **Intel Feed** | Auto-fetched company news, blog posts, announcements — tagged unread/read across sessions |
| ✅ **Daily Tasks** | Per-job research tasks seeded each morning with persistent completion tracking |
| 🎓 **Mastery** | Skill checklist grouped by category with progress bars, persists across devices |
| 📝 **Notes** | Free-form research notes with tags, editable and searchable |
| 🏢 **Company** | Company profile card: description, HQ, funding, employee count, founders, investors |
| 🔬 **Research** | Academic papers and patents by founders/executives, scored for interview relevance |
| 🎯 **Readiness** | Personalised gap analysis: match score, skill radar, study plan, talking points |

---

## Architecture

### Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | Next.js 15 (App Router) | React + API routes, server components, SSR auth |
| Database | Supabase (Postgres) | Free tier, RLS, real-time, SSR client |
| Auth | Supabase Auth (Google OAuth) | One-click login, email-gated access |
| Background jobs | Inngest | Durable multi-step pipeline with checkpointing |
| Styling | Tailwind CSS | Rapid iteration |
| Analytics | Vercel Analytics | Zero-config pageview tracking |
| AI | Anthropic Claude | Synthesis, PDF parsing, gap analysis |
| Search | SerpAPI | Google KG, News, Patents, LinkedIn search |
| LinkedIn data | Proxycurl | Structured LinkedIn profile import |
| Hosting | Vercel | GitHub auto-deploy |

### Research Pipeline (Inngest — 6 phases)

Each phase is a durable `step.run()` — Inngest checkpoints after each one so retries resume from the last incomplete step, not the start.

| Phase | ID | What it does | APIs |
|-------|----|-------------|------|
| P1 | `p1_company` | Company overview, founders, CEO, funding | SerpAPI (KG + organic), Wikipedia, Crunchbase (opt) |
| P2 | `p2_entities` | LinkedIn URL discovery per entity | SerpAPI `site:linkedin.com/in` |
| P3 | `p3_research` | Academic papers + company patents | Semantic Scholar, SerpAPI Patents |
| P4 | `p4_news` | Refresh news & blog articles | SerpAPI Google News |
| P5 | `p5_synthesis` | Claude scores + annotates papers/patents for interview relevance | Anthropic Claude Opus |
| P6 | `p6_gap_analysis` | Diff user profile vs JD — generates match score, skill radar, study plan, talking points | Anthropic Claude Opus |

### Profile & Gap Analysis

Users set a global profile (used across all jobs) via `/profile`:
- **LinkedIn import** — Proxycurl fetches full work history, skills, patents, certifications
- **PDF upload** — Claude parses any resume or LinkedIn PDF export

P6 loads the profile, compares it against the job's role/company/JD notes, and writes structured JSON to `research_jobs.gap_analysis`:

```json
{
  "match_score": 78,
  "skill_radar": [{ "skill": "Kubernetes", "user_level": 3, "required_level": 5 }],
  "study_topics": [{ "topic": "...", "priority": "high", "reason": "...", "resources": ["..."] }],
  "strengths": [{ "area": "...", "detail": "..." }],
  "talking_points": [{ "requirement": "...", "talking_point": "...", "evidence": "..." }]
}
```

### Admin Console (`/admin`)

Gated to `douglasyoud@gmail.com`. Shows all research jobs across users with:
- Inngest health badge
- Phase progress per job
- Retry / Cancel controls
- Auto-refresh every 15s

---

## Project Structure

```
├── app/
│   ├── admin/                      ← Admin console (server component + auth gate)
│   ├── api/
│   │   ├── admin/
│   │   │   ├── cancel/             ← Cancel a stuck research job
│   │   │   ├── jobs/               ← Fetch all jobs for admin view
│   │   │   ├── migrate/            ← One-shot DB migration runner (delete after use)
│   │   │   └── retry/              ← Retry a failed job
│   │   ├── fetch-intel/            ← Server-side news + blog fetcher
│   │   ├── inngest/                ← Inngest webhook (must be public)
│   │   ├── profile/
│   │   │   ├── route.ts            ← GET/POST user profile
│   │   │   ├── scrape/             ← Proxycurl LinkedIn import
│   │   │   └── upload/             ← PDF/resume upload → Claude parse
│   │   └── research/
│   │       ├── start/              ← Create research_jobs row + fire Inngest event
│   │       └── status/             ← Poll latest research_jobs row
│   ├── auth/callback/              ← Supabase OAuth callback handler
│   ├── jobs/[id]/                  ← Per-job dashboard page
│   ├── login/                      ← Google OAuth login page
│   ├── profile/                    ← User profile settings page
│   └── layout.tsx                  ← Root layout with Vercel Analytics
├── components/
│   ├── AdminConsole.tsx            ← Admin job monitor (client, auto-refresh)
│   ├── CompanyProfile.tsx          ← Company info card
│   ├── Header.tsx                  ← App header (nav, auth, profile link)
│   ├── JobCard.tsx                 ← Job summary card on overview page
│   ├── JobHub.tsx                  ← Per-job tabbed dashboard (client)
│   ├── ProfileSetup.tsx            ← LinkedIn URL input + PDF dropzone
│   ├── ReadinessTab.tsx            ← Gap analysis UI (score ring, skill bars, study plan)
│   ├── ResearchJobStatus.tsx       ← Pipeline status + start/retry button
│   └── ResearchPapers.tsx          ← Papers + patents with relevance scores
├── inngest/
│   ├── client.ts                   ← Inngest client singleton
│   └── research-agent.ts           ← 6-phase research pipeline function
├── lib/
│   ├── storage.ts                  ← All Supabase data access functions
│   ├── supabase.ts                 ← Browser Supabase client
│   └── types.ts                    ← TypeScript types
├── middleware.ts                   ← Auth gating (keeps /api/inngest public)
└── supabase/
    ├── schema.sql                  ← Base tables: intel_items, daily_tasks, mastery, notes
    ├── migration_auth.sql          ← Auth: mastery_completions with user_id
    ├── migration_jobs.sql          ← Jobs table + per-job FK columns
    ├── migration_research.sql      ← Research pipeline tables
    └── migration_user_profile.sql  ← user_profiles + gap_analysis on research_jobs
```

---

## Setup

### 1. Clone & install

```bash
git clone https://github.com/cnidus/job-hunt-tools.git
cd job-hunt-tools
npm install
```

### 2. Create Supabase project

1. New project at [supabase.com](https://supabase.com)
2. SQL Editor → run each migration file in order:
   - `supabase/schema.sql`
   - `supabase/migration_auth.sql`
   - `supabase/migration_jobs.sql`
   - `supabase/migration_research.sql`
   - `supabase/migration_user_profile.sql`

### 3. Environment variables

```bash
cp .env.local.example .env.local
```

| Variable | Where to get it | Required |
|----------|----------------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL | ✅ |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Settings → API → Publishable key | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role | ✅ |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) | ✅ |
| `INNGEST_EVENT_KEY` | Injected by Inngest Vercel integration | ✅ |
| `INNGEST_SIGNING_KEY` | Injected by Inngest Vercel integration | ✅ |
| `SERP_API_KEY` | [serpapi.com](https://serpapi.com) — 100 free/month | Recommended |
| `PROXYCURL_API_KEY` | [nubela.co/proxycurl](https://nubela.co/proxycurl) — ~$0.01/lookup | For LinkedIn import |
| `SUPABASE_ACCESS_TOKEN` | Supabase → Account → Access Tokens | For migration runner only |
| `CRUNCHBASE_API_KEY` | [crunchbase.com/api](https://data.crunchbase.com/) | Optional |

### 4. Set up Inngest

1. [app.inngest.com](https://app.inngest.com) → create account
2. Install the Vercel integration (auto-injects `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY`)
3. After deploy, sync your app: Inngest dashboard → Apps → Sync → `https://your-app.vercel.app/api/inngest`

### 5. Run locally

```bash
npm run dev
# In a separate terminal:
npx inngest-cli@latest dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deployment

1. Push repo to GitHub
2. Import to [vercel.com](https://vercel.com) → select repo
3. Add all required environment variables
4. Deploy — every `git push main` auto-deploys

**Critical:** `/api/inngest` must be publicly reachable (not auth-gated). This is handled in `middleware.ts`.

---

## Adding a New Job

1. Home page → **+ Add Job** → fill in company, role, URL, salary, status
2. Open the job → **🔬 Research** tab → **Start Research**
3. The 6-phase pipeline runs in the background (~3–8 min depending on API latency)
4. Results appear in **🏢 Company**, **🔬 Research**, and **🎯 Readiness** tabs

---

## User Profile & Gap Analysis

1. Header → **👤 Profile**
2. Either:
   - Paste your LinkedIn URL → **Import** (uses Proxycurl, ~$0.01)
   - Or drag-drop your resume PDF → Claude parses it for free
3. Start a new research run on any job — P6 automatically runs gap analysis
4. **🎯 Readiness** tab shows your personalised results

---

## Key Architectural Decisions

**Why Inngest for the pipeline?**
SerpAPI, Semantic Scholar, and Anthropic calls can each take 5–30s. Doing them in a single API route would time out on Vercel's 10s limit. Inngest gives us durable execution with per-step retries and a 15-min function timeout.

**Why is `/api/inngest` public in middleware?**
Inngest Cloud pushes events to your app via HTTP. If the route is auth-gated, Inngest's webhook gets redirected to `/login` and can't sync. This was the root cause of all early Inngest connectivity failures.

**Why strict KG validation in P1?**
Google's Knowledge Graph returns the highest-confidence entity for a search query — which may not be your company. E.g. searching "Clockwork" returns the Minnesota IT staffing firm. The pipeline validates that the KG title *contains* the full company name (after stripping legal suffixes) before using any KG data.

**Why is CEO never pulled from the KG?**
The KG `People also search for` panel is unreliable for small startups. CEO/founder data comes exclusively from organic search snippet parsing against `"CompanyName" CEO OR founder`.

# Clockwork Research Hub

A persistent daily research tracker for the Clockwork.io Senior Solutions Engineer job pursuit.

**Features**
- 📰 **Intel Feed** — news, blog posts, webinars, manual entries tagged NEW/UNREAD across sessions
- ✅ **Daily Tasks** — rotating research tasks seeded each morning, with persistent completion tracking
- 🎓 **Mastery Checklist** — per-topic skill tracking with progress bars, persists across devices
- 📝 **Research Notes** — capture learnings with tags; editable, deletable
- 🔄 **Auto-fetch** — server-side intel fetcher pulls from Clockwork's blog and Google News (SerpAPI)

---

## Quick Start

### 1. Clone & install

```bash
git clone https://github.com/YOUR_USERNAME/clockwork-tracker.git
cd clockwork-tracker
npm install
```

### 2. Set up Supabase

1. Create a free account at [supabase.com](https://supabase.com)
2. Create a new project (choose any region, set a strong database password)
3. In the Supabase dashboard, go to **SQL Editor → New query**
4. Paste and run the contents of `supabase/schema.sql`
5. Then paste and run `supabase/seed.sql` to populate initial data

### 3. Configure environment variables

```bash
cp .env.local.example .env.local
```

Edit `.env.local` with your Supabase credentials:
- `NEXT_PUBLIC_SUPABASE_URL` — from Settings → API → Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from Settings → API → anon/public key

Optionally add a SerpAPI key for Google News auto-fetch (100 free searches/month):
- Sign up at [serpapi.com](https://serpapi.com)
- Add your key as `SERP_API_KEY`

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deploying to Vercel (free)

1. Push your repo to GitHub
2. Go to [vercel.com](https://vercel.com) → Import Project → select your repo
3. Add your environment variables in Vercel's project settings
4. Deploy — takes ~60 seconds

Every `git push` to `main` auto-deploys.

---

## Adding Intel Items

### Automatically
Hit **"Fetch Intel"** in the header — this calls `/api/fetch-intel` which:
1. Scrapes Clockwork's public blog for new posts
2. Searches Google News for "Clockwork Systems AI" etc. (requires `SERP_API_KEY`)
3. Deduplicates by URL and inserts new items into Supabase

### Manually (in-app)
In the Intel Feed tab → **"+ Add Manual Item"**. Use this for:
- LinkedIn posts you spotted
- Webinar registrations
- Anything you found while browsing

### Via SQL (power user)
Insert directly into `intel_items` in the Supabase dashboard for bulk imports.

---

## Extending

### Add a new data source
Edit `app/api/fetch-intel/route.ts`. Add a new async function following the same pattern as `fetchClockworkBlog()`, call it in the `GET` handler, and add its results to the `upsertItems()` call.

### Add a new tab
1. Add a new component in `components/`
2. Add the tab definition in `app/page.tsx` (`TABS` array)
3. Add state + handlers in `app/page.tsx`
4. Add storage functions in `lib/storage.ts` if you need a new table

### Set up a daily cron (Vercel)
Add a `vercel.json` at the project root:
```json
{
  "crons": [{
    "path": "/api/fetch-intel",
    "schedule": "0 8 * * *"
  }]
}
```
This calls the fetch endpoint every morning at 8am UTC. Requires a Vercel Pro plan for cron jobs.

### LinkedIn monitoring (when a connector exists)
The `IntelSource` type in `lib/types.ts` already includes `'linkedin_manual'`. When a LinkedIn MCP or API becomes available, add a fetcher in `fetch-intel/route.ts` and change the source to a new `'linkedin_auto'` value.

---

## Project Structure

```
clockwork-tracker/
├── app/
│   ├── api/fetch-intel/route.ts   ← Server-side intel fetcher
│   ├── layout.tsx
│   ├── page.tsx                   ← Main dashboard (all state lives here)
│   └── globals.css
├── components/
│   ├── Header.tsx                 ← App header with status + refresh
│   ├── IntelFeed.tsx              ← Feed with filters (unread / today / saved)
│   ├── IntelItemCard.tsx          ← Individual intel item with action buttons
│   ├── DailyTasks.tsx             ← Daily tasks with progress bar
│   ├── MasteryChecklist.tsx       ← Skill checklist grouped by category
│   └── ResearchNotes.tsx          ← CRUD notes with tags
├── lib/
│   ├── supabase.ts                ← Supabase client (null if unconfigured)
│   ├── storage.ts                 ← All data access functions
│   └── types.ts                   ← TypeScript types + UI helpers
└── supabase/
    ├── schema.sql                 ← Run first: creates all tables
    └── seed.sql                   ← Run second: initial intel + mastery items
```

---

## Tech Stack

| Layer      | Choice        | Why                                              |
|------------|---------------|--------------------------------------------------|
| Framework  | Next.js 14    | React + API routes in one repo, one deploy       |
| Database   | Supabase      | Free Postgres, simple JS client, real-time ready |
| Styling    | Tailwind CSS  | Rapid iteration, easy to maintain                |
| Hosting    | Vercel        | One-click deploy from GitHub, free tier          |
| Language   | TypeScript    | Catches bugs early, self-documents the data model|

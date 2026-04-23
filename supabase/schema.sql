-- ============================================================
-- Clockwork Research Hub — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- Intel items: news, blog posts, webinars, LinkedIn posts, announcements
create table if not exists intel_items (
  id            uuid primary key default gen_random_uuid(),
  source        text not null,  -- 'clockwork_blog' | 'news' | 'linkedin_manual' | 'webinar' | 'manual'
  item_type     text not null,  -- 'article' | 'webinar' | 'announcement' | 'post' | 'press_release'
  title         text not null,
  url           text,
  summary       text,
  published_at  timestamptz not null default now(),
  fetched_at    timestamptz not null default now(),
  tags          text[] default '{}',
  metadata      jsonb default '{}'   -- flexible bucket for source-specific fields
);

-- User actions per intel item
create table if not exists user_actions (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references intel_items(id) on delete cascade,
  action       text not null,  -- 'read' | 'acknowledged' | 'registered' | 'bookmarked' | 'skipped'
  actioned_at  timestamptz not null default now(),
  notes        text,
  unique(item_id, action)      -- one action type per item (upsert-safe)
);

-- Daily research tasks (one row per task per date)
create table if not exists daily_tasks (
  id           uuid primary key default gen_random_uuid(),
  task_date    date not null,
  title        text not null,
  detail       text,
  category     text not null default 'general',  -- 'company' | 'technical' | 'presales' | 'market'
  completed_at timestamptz,
  notes        text,
  sort_order   int default 0
);

-- Mastery checklist (persists across sessions)
create table if not exists mastery_items (
  id           uuid primary key default gen_random_uuid(),
  category     text not null,
  title        text not null,
  priority     text not null default 'high',  -- 'must' | 'high' | 'medium'
  completed_at timestamptz,
  sort_order   int default 0
);

-- Free-form research notes
create table if not exists research_notes (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  title       text not null,
  content     text not null default '',
  tags        text[] default '{}'
);

-- ── Helpful indexes ────────────────────────────────────────────────────────
create index if not exists intel_items_published_at_idx on intel_items(published_at desc);
create index if not exists user_actions_item_id_idx     on user_actions(item_id);
create index if not exists daily_tasks_date_idx         on daily_tasks(task_date);

-- ── Updated-at trigger for notes ──────────────────────────────────────────
create or replace function update_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists research_notes_updated_at on research_notes;
create trigger research_notes_updated_at
  before update on research_notes
  for each row execute function update_updated_at();

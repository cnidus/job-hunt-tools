/**
 * storage.ts
 *
 * Abstraction layer over Supabase.
 * All data access goes through here.
 *
 * Data model:
 *   - jobs:                per-user job listings
 *   - intel_items:         per-job news / articles
 *   - user_actions:        per-user read/bookmark state on intel items
 *   - daily_tasks:         per-user, per-job tasks for each day
 *   - mastery_items:       shared read-only templates
 *   - mastery_completions: per-user, per-job completion state
 *   - research_notes:      per-user, per-job notes
 */

import { supabase } from './supabase'
import type {
  Job,
  IntelItem,
  UserAction,
  ActionType,
  DailyTask,
  MasteryItem,
  ResearchNote,
} from './types'

// ─── Auth helper ──────────────────────────────────────────────────────────

async function getCurrentUserId(): Promise<string | null> {
  if (!supabase) return null
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

// ─── Jobs ─────────────────────────────────────────────────────────────────

export async function fetchJobs(): Promise<Job[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) { console.error('fetchJobs:', error); return [] }
  return (data ?? []) as Job[]
}

export async function fetchJob(id: string): Promise<Job | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', id)
    .single()
  if (error) { console.error('fetchJob:', error); return null }
  return data as Job
}

export async function createJob(
  job: Omit<Job, 'id' | 'user_id' | 'created_at' | 'updated_at'>
): Promise<Job | null> {
  if (!supabase) return null
  const userId = await getCurrentUserId()
  if (!userId) return null
  const { data, error } = await supabase
    .from('jobs')
    .insert({ ...job, user_id: userId })
    .select()
    .single()
  if (error) { console.error('createJob:', error); return null }
  return data as Job
}

export async function updateJob(
  id: string,
  patch: Partial<Omit<Job, 'id' | 'user_id' | 'created_at'>>
): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase
    .from('jobs')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) { console.error('updateJob:', error); return false }
  return true
}

export async function deleteJob(id: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('jobs').delete().eq('id', id)
  if (error) { console.error('deleteJob:', error); return false }
  return true
}

// ─── Intel Items ──────────────────────────────────────────────────────────

export async function fetchIntelItems(jobId: string): Promise<IntelItem[]> {
  if (!supabase) return []

  const { data: items, error } = await supabase
    .from('intel_items')
    .select('*')
    .eq('job_id', jobId)
    .order('published_at', { ascending: false })

  if (error) { console.error('fetchIntelItems:', error); return [] }

  const ids = (items ?? []).map((i) => i.id)
  if (ids.length === 0) return []

  const { data: actions } = await supabase
    .from('user_actions')
    .select('*')
    .in('item_id', ids)

  const actionMap: Record<string, UserAction[]> = {}
  for (const a of actions ?? []) {
    if (!actionMap[a.item_id]) actionMap[a.item_id] = []
    actionMap[a.item_id].push(a as UserAction)
  }

  return (items ?? []).map((item) => ({
    ...item,
    tags:     item.tags ?? [],
    metadata: item.metadata ?? {},
    actions:  actionMap[item.id] ?? [],
  })) as IntelItem[]
}

export async function fetchIntelUnreadCount(jobId: string): Promise<number> {
  if (!supabase) return 0

  const { data: items } = await supabase
    .from('intel_items')
    .select('id')
    .eq('job_id', jobId)

  if (!items?.length) return 0

  const ids = items.map((i) => i.id)
  const { data: actions } = await supabase
    .from('user_actions')
    .select('item_id')
    .in('item_id', ids)
    .in('action', ['read', 'acknowledged'])

  const readIds = new Set((actions ?? []).map((a) => a.item_id))
  return ids.filter((id) => !readIds.has(id)).length
}

export async function addIntelItem(
  item: Omit<IntelItem, 'id' | 'fetched_at' | 'actions'>,
  jobId: string
): Promise<IntelItem | null> {
  if (!supabase) return null

  const { data, error } = await supabase
    .from('intel_items')
    .insert({ ...item, job_id: jobId })
    .select()
    .single()

  if (error) { console.error('addIntelItem:', error); return null }
  return { ...data, actions: [] } as IntelItem
}

// ─── User Actions ─────────────────────────────────────────────────────────

export async function recordAction(
  itemId: string,
  action: ActionType,
  notes?: string
): Promise<boolean> {
  if (!supabase) return false
  const userId = await getCurrentUserId()
  if (!userId) return false

  const { error } = await supabase
    .from('user_actions')
    .upsert(
      { item_id: itemId, action, user_id: userId, notes: notes ?? null },
      { onConflict: 'item_id,action,user_id' }
    )

  if (error) { console.error('recordAction:', error); return false }
  return true
}

export async function removeAction(itemId: string, action: ActionType): Promise<boolean> {
  if (!supabase) return false
  const userId = await getCurrentUserId()
  if (!userId) return false

  const { error } = await supabase
    .from('user_actions')
    .delete()
    .eq('item_id', itemId)
    .eq('action', action)
    .eq('user_id', userId)

  if (error) { console.error('removeAction:', error); return false }
  return true
}

// ─── Daily Tasks ──────────────────────────────────────────────────────────

export async function fetchTasksForDate(date: string, jobId: string): Promise<DailyTask[]> {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('daily_tasks')
    .select('*')
    .eq('task_date', date)
    .eq('job_id', jobId)
    .order('sort_order')

  if (error) { console.error('fetchTasksForDate:', error); return [] }
  return (data ?? []) as DailyTask[]
}

export async function upsertTask(
  task: Omit<DailyTask, 'id'>,
  jobId: string
): Promise<DailyTask | null> {
  if (!supabase) return null
  const userId = await getCurrentUserId()
  if (!userId) return null

  const { data, error } = await supabase
    .from('daily_tasks')
    .insert({ ...task, user_id: userId, job_id: jobId })
    .select()
    .single()

  if (error) { console.error('upsertTask:', error); return null }
  return data as DailyTask
}

export async function completeTask(id: string, completed: boolean): Promise<boolean> {
  if (!supabase) return false

  const { error } = await supabase
    .from('daily_tasks')
    .update({ completed_at: completed ? new Date().toISOString() : null })
    .eq('id', id)

  if (error) { console.error('completeTask:', error); return false }
  return true
}

// ─── Mastery Items ────────────────────────────────────────────────────────

export async function fetchMasteryItems(jobId: string): Promise<MasteryItem[]> {
  if (!supabase) return []

  const [{ data: items, error }, { data: completions }] = await Promise.all([
    supabase.from('mastery_items').select('*').order('sort_order'),
    supabase
      .from('mastery_completions')
      .select('mastery_item_id, completed_at')
      .eq('job_id', jobId),
  ])

  if (error) { console.error('fetchMasteryItems:', error); return [] }

  const completionMap: Record<string, string> = {}
  for (const c of completions ?? []) {
    completionMap[c.mastery_item_id] = c.completed_at
  }

  return (items ?? []).map((item) => ({
    ...item,
    completed_at: completionMap[item.id] ?? null,
  })) as MasteryItem[]
}

export async function completeMasteryItem(
  id: string,
  completed: boolean,
  jobId: string
): Promise<boolean> {
  if (!supabase) return false
  const userId = await getCurrentUserId()
  if (!userId) return false

  // Delete then re-insert to avoid partial-index upsert complexity
  await supabase
    .from('mastery_completions')
    .delete()
    .eq('mastery_item_id', id)
    .eq('user_id', userId)
    .eq('job_id', jobId)

  if (completed) {
    const { error } = await supabase
      .from('mastery_completions')
      .insert({
        mastery_item_id: id,
        user_id: userId,
        job_id: jobId,
        completed_at: new Date().toISOString(),
      })
    if (error) { console.error('completeMasteryItem:', error); return false }
  }

  return true
}

// ─── Research Notes ───────────────────────────────────────────────────────

export async function fetchNotes(jobId: string): Promise<ResearchNote[]> {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('research_notes')
    .select('*')
    .eq('job_id', jobId)
    .order('updated_at', { ascending: false })

  if (error) { console.error('fetchNotes:', error); return [] }
  return (data ?? []) as ResearchNote[]
}

export async function saveNote(
  note: Omit<ResearchNote, 'id' | 'created_at' | 'updated_at'>,
  jobId: string
): Promise<ResearchNote | null> {
  if (!supabase) return null
  const userId = await getCurrentUserId()
  if (!userId) return null

  const { data, error } = await supabase
    .from('research_notes')
    .insert({ ...note, user_id: userId, job_id: jobId })
    .select()
    .single()

  if (error) { console.error('saveNote:', error); return null }
  return data as ResearchNote
}

export async function updateNote(
  id: string,
  patch: Partial<Pick<ResearchNote, 'title' | 'content' | 'tags'>>
): Promise<boolean> {
  if (!supabase) return false

  const { error } = await supabase
    .from('research_notes')
    .update(patch)
    .eq('id', id)

  if (error) { console.error('updateNote:', error); return false }
  return true
}

export async function deleteNote(id: string): Promise<boolean> {
  if (!supabase) return false

  const { error } = await supabase
    .from('research_notes')
    .delete()
    .eq('id', id)

  if (error) { console.error('deleteNote:', error); return false }
  return true
}

// ─── Research jobs ────────────────────────────────────────────────────────────

export async function fetchLatestResearchJob(jobId: string): Promise<import('./types').ResearchJob | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('research_jobs')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) { console.error('fetchLatestResearchJob:', error); return null }
  return data as import('./types').ResearchJob | null
}

// ─── Company profile ──────────────────────────────────────────────────────────

export async function fetchCompanyProfile(jobId: string): Promise<import('./types').CompanyProfile | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('company_profiles')
    .select('*')
    .eq('job_id', jobId)
    .maybeSingle()
  if (error) { console.error('fetchCompanyProfile:', error); return null }
  return data as import('./types').CompanyProfile | null
}

// ─── Company entities ─────────────────────────────────────────────────────────

export async function fetchCompanyEntities(jobId: string): Promise<import('./types').CompanyEntity[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('company_entities')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: true })
  if (error) { console.error('fetchCompanyEntities:', error); return [] }
  return (data ?? []) as import('./types').CompanyEntity[]
}

// ─── Company investors ────────────────────────────────────────────────────────

export async function fetchCompanyInvestors(jobId: string): Promise<import('./types').CompanyInvestor[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('company_investors')
    .select('*')
    .eq('job_id', jobId)
    .order('lead_investor', { ascending: false })
  if (error) { console.error('fetchCompanyInvestors:', error); return [] }
  return (data ?? []) as import('./types').CompanyInvestor[]
}

// ─── Research papers ──────────────────────────────────────────────────────────

export async function fetchResearchPapers(jobId: string): Promise<import('./types').ResearchPaper[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('research_papers')
    .select('*')
    .eq('job_id', jobId)
    .order('relevance_score', { ascending: false, nullsFirst: false })
  if (error) { console.error('fetchResearchPapers:', error); return [] }
  return (data ?? []) as import('./types').ResearchPaper[]
}

// ─── Patents ──────────────────────────────────────────────────────────────────

export async function fetchPatents(jobId: string): Promise<import('./types').ResearchPatent[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('patents')
    .select('*')
    .eq('job_id', jobId)
    .order('relevance_score', { ascending: false, nullsFirst: false })
  if (error) { console.error('fetchPatents:', error); return [] }
  return (data ?? []) as import('./types').ResearchPatent[]
}

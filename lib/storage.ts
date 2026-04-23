/**
 * storage.ts
 *
 * Abstraction layer over Supabase.
 * All data access goes through here — swap the backend without touching components.
 *
 * Auth model:
 *   - intel_items: shared across all users (RLS: SELECT for authenticated)
 *   - user_actions, daily_tasks, research_notes: per-user via RLS + explicit user_id
 *   - mastery_items: shared read-only templates
 *   - mastery_completions: per-user completion state
 *
 * RLS on the DB enforces isolation — user_id in writes is belt-and-suspenders.
 */

import { supabase } from './supabase'
import type {
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

// ─── Intel Items ──────────────────────────────────────────────────────────

export async function fetchIntelItems(): Promise<IntelItem[]> {
  if (!supabase) return []

  const { data: items, error } = await supabase
    .from('intel_items')
    .select('*')
    .order('published_at', { ascending: false })

  if (error) { console.error('fetchIntelItems:', error); return [] }

  const ids = (items ?? []).map((i) => i.id)
  if (ids.length === 0) return []

  // RLS automatically scopes user_actions to the current user
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

export async function addIntelItem(
  item: Omit<IntelItem, 'id' | 'fetched_at' | 'actions'>
): Promise<IntelItem | null> {
  if (!supabase) return null

  const { data, error } = await supabase
    .from('intel_items')
    .insert({ ...item })
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

export async function fetchTasksForDate(date: string): Promise<DailyTask[]> {
  if (!supabase) return []

  // RLS scopes this to the current user automatically
  const { data, error } = await supabase
    .from('daily_tasks')
    .select('*')
    .eq('task_date', date)
    .order('sort_order')

  if (error) { console.error('fetchTasksForDate:', error); return [] }
  return (data ?? []) as DailyTask[]
}

export async function upsertTask(task: Omit<DailyTask, 'id'>): Promise<DailyTask | null> {
  if (!supabase) return null
  const userId = await getCurrentUserId()
  if (!userId) return null

  const { data, error } = await supabase
    .from('daily_tasks')
    .insert({ ...task, user_id: userId })
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

export async function fetchMasteryItems(): Promise<MasteryItem[]> {
  if (!supabase) return []

  // Fetch shared templates + current user's completions in parallel
  const [{ data: items, error }, { data: completions }] = await Promise.all([
    supabase.from('mastery_items').select('*').order('sort_order'),
    supabase.from('mastery_completions').select('mastery_item_id, completed_at'),
    // RLS scopes mastery_completions to current user
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

export async function completeMasteryItem(id: string, completed: boolean): Promise<boolean> {
  if (!supabase) return false
  const userId = await getCurrentUserId()
  if (!userId) return false

  if (completed) {
    const { error } = await supabase
      .from('mastery_completions')
      .upsert(
        { mastery_item_id: id, user_id: userId, completed_at: new Date().toISOString() },
        { onConflict: 'user_id,mastery_item_id' }
      )
    if (error) { console.error('completeMasteryItem(insert):', error); return false }
  } else {
    const { error } = await supabase
      .from('mastery_completions')
      .delete()
      .eq('mastery_item_id', id)
      .eq('user_id', userId)
    if (error) { console.error('completeMasteryItem(delete):', error); return false }
  }

  return true
}

// ─── Research Notes ───────────────────────────────────────────────────────

export async function fetchNotes(): Promise<ResearchNote[]> {
  if (!supabase) return []

  // RLS scopes to current user
  const { data, error } = await supabase
    .from('research_notes')
    .select('*')
    .order('updated_at', { ascending: false })

  if (error) { console.error('fetchNotes:', error); return [] }
  return (data ?? []) as ResearchNote[]
}

export async function saveNote(
  note: Omit<ResearchNote, 'id' | 'created_at' | 'updated_at'>
): Promise<ResearchNote | null> {
  if (!supabase) return null
  const userId = await getCurrentUserId()
  if (!userId) return null

  const { data, error } = await supabase
    .from('research_notes')
    .insert({ ...note, user_id: userId })
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

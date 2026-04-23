// ─── Database row types ───────────────────────────────────────────────────

export type IntelSource =
  | 'clockwork_blog'
  | 'news'
  | 'linkedin_manual'
  | 'webinar'
  | 'manual'

export type IntelType =
  | 'article'
  | 'webinar'
  | 'announcement'
  | 'post'
  | 'press_release'

export type ActionType =
  | 'read'
  | 'acknowledged'
  | 'registered'
  | 'bookmarked'
  | 'skipped'

export type TaskCategory = 'company' | 'technical' | 'presales' | 'market' | 'general'

export type MasteryPriority = 'must' | 'high' | 'medium'

// ─── Core entities ────────────────────────────────────────────────────────

export interface IntelItem {
  id: string
  source: IntelSource
  item_type: IntelType
  title: string
  url: string | null
  summary: string | null
  published_at: string   // ISO timestamptz
  fetched_at: string
  tags: string[]
  metadata: Record<string, unknown>
  // Joined from user_actions (filtered to current user via RLS):
  actions?: UserAction[]
}

export interface UserAction {
  id: string
  item_id: string
  user_id: string
  action: ActionType
  actioned_at: string
  notes: string | null
}

export interface DailyTask {
  id: string
  task_date: string      // YYYY-MM-DD
  user_id?: string
  title: string
  detail: string | null
  category: TaskCategory
  completed_at: string | null
  notes: string | null
  sort_order: number
}

export interface MasteryItem {
  id: string
  category: string
  title: string
  priority: MasteryPriority
  completed_at: string | null  // derived from mastery_completions join
  sort_order: number
}

export interface MasteryCompletion {
  id: string
  user_id: string
  mastery_item_id: string
  completed_at: string
}

export interface ResearchNote {
  id: string
  created_at: string
  updated_at: string
  user_id?: string
  title: string
  content: string
  tags: string[]
}

// ─── UI helpers ───────────────────────────────────────────────────────────

/** Returns true if the item has been actioned with the given type */
export function hasAction(item: IntelItem, action: ActionType): boolean {
  return item.actions?.some((a) => a.action === action) ?? false
}

/** Returns true if an item is unread (no 'read' or 'acknowledged' action) */
export function isUnread(item: IntelItem): boolean {
  return !hasAction(item, 'read') && !hasAction(item, 'acknowledged')
}

/** Returns true if an item was fetched today */
export function isToday(item: IntelItem): boolean {
  return item.fetched_at.startsWith(new Date().toISOString().slice(0, 10))
}

/** Badge label for an item */
export function itemBadge(item: IntelItem): 'NEW' | 'UNREAD' | null {
  if (!isUnread(item)) return null
  return isToday(item) ? 'NEW' : 'UNREAD'
}

// Label map for source types
export const SOURCE_LABELS: Record<IntelSource, string> = {
  clockwork_blog:  '📝 Blog',
  news:            '📰 News',
  linkedin_manual: '💼 LinkedIn',
  webinar:         '🎥 Webinar',
  manual:          '📌 Manual',
}

// Label map for item types
export const TYPE_LABELS: Record<IntelType, string> = {
  article:       'Article',
  webinar:       'Webinar',
  announcement:  'Announcement',
  post:          'Post',
  press_release: 'Press Release',
}

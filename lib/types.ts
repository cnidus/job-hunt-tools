// ─── Job types ────────────────────────────────────────────────────────────

export type JobStatus =
  | 'saved'
  | 'applied'
  | 'interviewing'
  | 'offered'
  | 'rejected'
  | 'withdrawn'

export interface Job {
  id: string
  user_id: string
  company_name: string
  role_title: string
  company_url: string | null
  job_url: string | null
  salary_min: number | null
  salary_max: number | null
  location: string | null
  status: JobStatus
  applied_at: string | null  // YYYY-MM-DD
  notes: string | null
  created_at: string
  updated_at: string
}

// ─── Database row types ───────────────────────────────────────────────────

export type IntelSource =
  | 'company_blog'
  | 'clockwork_blog'   // legacy
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
  job_id: string | null
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
  job_id?: string
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
  job_id: string | null
  completed_at: string
}

export interface ResearchNote {
  id: string
  created_at: string
  updated_at: string
  user_id?: string
  job_id?: string
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

// ─── Status display helpers ───────────────────────────────────────────────

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  saved:        'Saved',
  applied:      'Applied',
  interviewing: 'Interviewing',
  offered:      'Offered',
  rejected:     'Rejected',
  withdrawn:    'Withdrawn',
}

export const JOB_STATUS_COLORS: Record<JobStatus, { bg: string; text: string; border: string }> = {
  saved:        { bg: 'bg-gray-100',    text: 'text-gray-600',   border: 'border-gray-200' },
  applied:      { bg: 'bg-blue-50',     text: 'text-blue-700',   border: 'border-blue-200' },
  interviewing: { bg: 'bg-purple-50',   text: 'text-purple-700', border: 'border-purple-200' },
  offered:      { bg: 'bg-green-50',    text: 'text-green-700',  border: 'border-green-200' },
  rejected:     { bg: 'bg-red-50',      text: 'text-red-600',    border: 'border-red-200' },
  withdrawn:    { bg: 'bg-gray-100',    text: 'text-gray-500',   border: 'border-gray-200' },
}

// Label map for source types
export const SOURCE_LABELS: Record<IntelSource, string> = {
  company_blog:    '📝 Blog',
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

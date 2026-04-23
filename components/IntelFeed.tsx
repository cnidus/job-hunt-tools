'use client'

import { useState, useMemo } from 'react'
import { IntelItem, ActionType, isUnread, isToday } from '@/lib/types'
import IntelItemCard from './IntelItemCard'

interface Props {
  items: IntelItem[]
  onAction: (itemId: string, action: ActionType) => void
  onAddManual: (item: { title: string; url: string; summary: string; item_type: string }) => void
}

type Filter = 'all' | 'unread' | 'today' | 'bookmarked' | 'webinars'

const FILTER_LABELS: Record<Filter, string> = {
  all:       'All',
  unread:    'Unread',
  today:     "Today's",
  bookmarked: 'Saved',
  webinars:  'Webinars',
}

export default function IntelFeed({ items, onAction, onAddManual }: Props) {
  const [filter, setFilter]         = useState<Filter>('unread')
  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm]             = useState({ title: '', url: '', summary: '', item_type: 'article' })

  const filtered = useMemo(() => {
    switch (filter) {
      case 'unread':    return items.filter(isUnread)
      case 'today':     return items.filter(isToday)
      case 'bookmarked': return items.filter((i) => i.actions?.some((a) => a.action === 'bookmarked'))
      case 'webinars':  return items.filter((i) => i.item_type === 'webinar')
      default:          return items
    }
  }, [items, filter])

  const counts = useMemo(() => ({
    all:       items.length,
    unread:    items.filter(isUnread).length,
    today:     items.filter(isToday).length,
    bookmarked: items.filter((i) => i.actions?.some((a) => a.action === 'bookmarked')).length,
    webinars:  items.filter((i) => i.item_type === 'webinar').length,
  }), [items])

  function handleSubmitManual(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title) return
    onAddManual(form)
    setForm({ title: '', url: '', summary: '', item_type: 'article' })
    setShowAddForm(false)
  }

  return (
    <div>
      {/* Filter bar */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex gap-1 bg-white rounded-lg border border-gray-100 p-0.5 shadow-sm">
          {(Object.keys(FILTER_LABELS) as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
                filter === f
                  ? 'bg-[#3d74cc] text-white'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {FILTER_LABELS[f]}
              {counts[f] > 0 && (
                <span className={`ml-1.5 text-[10px] px-1 py-0.5 rounded-full ${
                  filter === f ? 'bg-white/20' : 'bg-gray-100'
                }`}>
                  {counts[f]}
                </span>
              )}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="text-xs px-3 py-1.5 rounded-lg border border-[#c5d5f5] bg-[#f0f5ff] text-[#3d74cc] hover:bg-[#e8f0fe] font-medium transition-colors"
        >
          + Add Manual Item
        </button>
      </div>

      {/* Manual add form */}
      {showAddForm && (
        <form
          onSubmit={handleSubmitManual}
          className="bg-white rounded-xl border border-[#c5d5f5] p-4 mb-4 shadow-sm"
        >
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Add Intel Item</h3>
          <div className="grid grid-cols-1 gap-3">
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Title *"
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#3d74cc]"
            />
            <input
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="URL (optional)"
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#3d74cc]"
            />
            <textarea
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
              placeholder="Summary / notes (optional)"
              rows={2}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#3d74cc] resize-none"
            />
            <select
              value={form.item_type}
              onChange={(e) => setForm({ ...form, item_type: e.target.value })}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#3d74cc]"
            >
              <option value="article">Article</option>
              <option value="webinar">Webinar</option>
              <option value="announcement">Announcement</option>
              <option value="post">LinkedIn Post</option>
              <option value="press_release">Press Release</option>
            </select>
          </div>
          <div className="flex gap-2 mt-3">
            <button type="submit" className="text-sm px-4 py-1.5 rounded-lg bg-[#3d74cc] text-white font-medium hover:bg-[#2a5bb5]">
              Add
            </button>
            <button type="button" onClick={() => setShowAddForm(false)} className="text-sm px-4 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Items list */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <div className="text-3xl mb-2">✓</div>
          <p className="text-sm font-medium">All caught up!</p>
          <p className="text-xs mt-1">
            {filter === 'unread' ? 'No unread items. Hit "Fetch Intel" to check for new content.' : `No items match this filter.`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <IntelItemCard key={item.id} item={item} onAction={onAction} />
          ))}
        </div>
      )}
    </div>
  )
}

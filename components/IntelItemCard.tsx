'use client'

import { format, parseISO } from 'date-fns'
import {
  IntelItem, ActionType,
  SOURCE_LABELS, TYPE_LABELS,
  hasAction, isUnread, isToday,
} from '@/lib/types'

interface Props {
  item: IntelItem
  onAction: (itemId: string, action: ActionType) => void
}

const ACTION_COLORS: Record<ActionType, string> = {
  read:         'bg-blue-100 text-blue-700 border-blue-200',
  acknowledged: 'bg-green-100 text-green-700 border-green-200',
  registered:   'bg-purple-100 text-purple-700 border-purple-200',
  bookmarked:   'bg-yellow-100 text-yellow-700 border-yellow-200',
  skipped:      'bg-gray-100 text-gray-500 border-gray-200',
}

export default function IntelItemCard({ item, onAction }: Props) {
  const unread   = isUnread(item)
  const newToday = isToday(item)
  const isWebinar = item.item_type === 'webinar'
  const isRead    = hasAction(item, 'read') || hasAction(item, 'acknowledged')
  const isBookmarked = hasAction(item, 'bookmarked')
  const isRegistered = hasAction(item, 'registered')

  let published: string
  try {
    published = format(parseISO(item.published_at), 'MMM d, yyyy')
  } catch {
    published = item.published_at.slice(0, 10)
  }

  return (
    <div className={`bg-white rounded-xl border transition-all duration-200 ${
      unread
        ? 'border-[#c5d5f5] shadow-sm shadow-blue-100'
        : 'border-gray-100 opacity-80'
    }`}>
      <div className="p-4">

        {/* Top row: badges + date */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex flex-wrap items-center gap-1.5">

            {/* NEW / UNREAD badge */}
            {newToday && unread && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600 border border-red-200 badge-new-pulse">
                NEW
              </span>
            )}
            {!newToday && unread && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 border border-orange-200">
                UNREAD
              </span>
            )}
            {isRead && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 border border-gray-200">
                READ
              </span>
            )}

            {/* Source */}
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
              {SOURCE_LABELS[item.source] ?? item.source}
            </span>

            {/* Type */}
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-200">
              {TYPE_LABELS[item.item_type] ?? item.item_type}
            </span>
          </div>

          <span className="text-[11px] text-gray-400 whitespace-nowrap flex-shrink-0">{published}</span>
        </div>

        {/* Title */}
        <h3 className={`font-semibold text-sm leading-snug mb-1.5 ${unread ? 'text-gray-900' : 'text-gray-500'}`}>
          {item.url ? (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#3d74cc] hover:underline transition-colors"
              onClick={() => !isRead && onAction(item.id, 'read')}
            >
              {item.title}
            </a>
          ) : (
            item.title
          )}
        </h3>

        {/* Summary */}
        {item.summary && (
          <p className="text-xs text-gray-500 leading-relaxed mb-3 line-clamp-3">
            {item.summary}
          </p>
        )}

        {/* Tags */}
        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {item.tags.map((tag) => (
              <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-[#f0f5ff] text-[#3d74cc]">
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-50">

          {/* Mark Read */}
          <button
            onClick={() => onAction(item.id, isRead ? 'skipped' : 'read')}
            className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
              isRead
                ? ACTION_COLORS.read
                : 'bg-white text-gray-500 border-gray-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200'
            }`}
          >
            {isRead ? '✓ Read' : 'Mark Read'}
          </button>

          {/* Register (webinars only) */}
          {isWebinar && (
            <button
              onClick={() => onAction(item.id, 'registered')}
              className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
                isRegistered
                  ? ACTION_COLORS.registered
                  : 'bg-white text-gray-500 border-gray-200 hover:bg-purple-50 hover:text-purple-600 hover:border-purple-200'
              }`}
            >
              {isRegistered ? '✓ Registered' : '🎥 Register'}
            </button>
          )}

          {/* Bookmark */}
          <button
            onClick={() => onAction(item.id, 'bookmarked')}
            className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
              isBookmarked
                ? ACTION_COLORS.bookmarked
                : 'bg-white text-gray-500 border-gray-200 hover:bg-yellow-50 hover:text-yellow-600 hover:border-yellow-200'
            }`}
          >
            {isBookmarked ? '★ Saved' : '☆ Save'}
          </button>

          {/* Open link */}
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => !isRead && onAction(item.id, 'read')}
              className="ml-auto text-xs text-[#3d74cc] hover:underline"
            >
              Open →
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

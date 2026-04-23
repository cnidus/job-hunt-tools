'use client'

import Link from 'next/link'
import type { Job } from '@/lib/types'
import { JOB_STATUS_LABELS, JOB_STATUS_COLORS } from '@/lib/types'

interface Props {
  job: Job
  unreadCount: number
  tasksDone: number
  tasksTotal: number
}

export default function JobCard({ job, unreadCount, tasksDone, tasksTotal }: Props) {
  const status = job.status
  const colors = JOB_STATUS_COLORS[status]
  const completion = tasksTotal > 0 ? Math.round((tasksDone / tasksTotal) * 100) : null

  const salaryStr = job.salary_min || job.salary_max
    ? `$${job.salary_min ? job.salary_min + 'K' : '?'}–${job.salary_max ? job.salary_max + 'K' : '?'}`
    : null

  const appliedStr = job.applied_at
    ? new Date(job.applied_at + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      })
    : null

  return (
    <Link href={`/jobs/${job.id}`} className="block group">
      <div className="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md hover:border-blue-100 transition-all duration-150">
        {/* Top row: company + status badge */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            {/* Company initial badge */}
            <div className="flex items-center gap-2.5 mb-1">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #1a3a6b 0%, #3d74cc 100%)' }}
              >
                {job.company_name[0].toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-gray-800 text-sm leading-tight truncate">
                  {job.company_name}
                </p>
                <p className="text-xs text-gray-500 truncate">{job.role_title}</p>
              </div>
            </div>
          </div>

          {/* Status badge */}
          <span className={`flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-full border ${colors.bg} ${colors.text} ${colors.border}`}>
            {JOB_STATUS_LABELS[status]}
          </span>
        </div>

        {/* Meta chips */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {job.location && (
            <span className="text-[11px] text-gray-500 bg-gray-50 px-2 py-0.5 rounded-full">
              📍 {job.location}
            </span>
          )}
          {salaryStr && (
            <span className="text-[11px] text-gray-500 bg-gray-50 px-2 py-0.5 rounded-full">
              💰 {salaryStr}
            </span>
          )}
          {appliedStr && (
            <span className="text-[11px] text-gray-500 bg-gray-50 px-2 py-0.5 rounded-full">
              🎯 {appliedStr}
            </span>
          )}
        </div>

        {/* Metrics row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Unread intel badge */}
            {unreadCount > 0 ? (
              <div className="flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 px-2 py-1 rounded-full border border-red-100">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                {unreadCount} new
              </div>
            ) : (
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                All read
              </div>
            )}

            {/* Task completion */}
            {completion !== null && (
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-400 transition-all"
                    style={{ width: `${completion}%` }}
                  />
                </div>
                <span>{completion}%</span>
              </div>
            )}
          </div>

          {/* Arrow */}
          <span className="text-gray-300 group-hover:text-blue-400 transition-colors text-lg leading-none">
            →
          </span>
        </div>
      </div>
    </Link>
  )
}

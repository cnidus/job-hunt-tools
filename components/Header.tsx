'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import type { Job } from '@/lib/types'
import { JOB_STATUS_LABELS } from '@/lib/types'

interface HeaderProps {
  // Job-specific mode (shown on /jobs/[id])
  job?: Job
  unreadCount?: number
  onRefresh?: () => void
  refreshing?: boolean
}

export default function Header({ job, unreadCount = 0, onRefresh, refreshing }: HeaderProps) {
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
  }, [])

  async function handleSignOut() {
    if (!supabase) return
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const salaryStr = job && (job.salary_min || job.salary_max)
    ? `$${job.salary_min ? job.salary_min + 'K' : '?'}–${job.salary_max ? job.salary_max + 'K' : '?'}`
    : null

  const appliedStr = job?.applied_at
    ? new Date(job.applied_at + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      })
    : null

  return (
    <header className="text-white" style={{ background: 'linear-gradient(135deg, #1a3a6b 0%, #3d74cc 100%)' }}>
      <div className="max-w-6xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">

          {/* Left: branding */}
          <div className="flex items-center gap-3">
            {job ? (
              <>
                {/* Back link */}
                <Link
                  href="/"
                  className="text-white/60 hover:text-white text-sm transition-colors flex items-center gap-1"
                >
                  ← Jobs
                </Link>
                <span className="text-white/30">|</span>
                {/* Company badge */}
                <div className="bg-white/20 border border-white/30 font-bold text-xs px-2.5 py-1 rounded-md tracking-wide">
                  {job.company_name.toUpperCase()}
                </div>
                <div>
                  <h1 className="text-lg font-bold leading-tight">{job.role_title}</h1>
                  <p className="text-xs opacity-75">
                    {[job.location, salaryStr].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="bg-white/20 border border-white/30 font-bold text-xs px-2.5 py-1 rounded-md tracking-wide">
                  RESEARCH HUB
                </div>
                <div>
                  <h1 className="text-lg font-bold leading-tight">Job Tracker</h1>
                  <p className="text-xs opacity-75">Track, research, and prep for every role</p>
                </div>
              </>
            )}
          </div>

          {/* Right: controls */}
          <div className="flex items-center gap-2">
            {/* Supabase status */}
            <div className={`hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
              isSupabaseConfigured
                ? 'border-green-400/40 bg-green-400/10 text-green-200'
                : 'border-yellow-400/40 bg-yellow-400/10 text-yellow-200'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isSupabaseConfigured ? 'bg-green-400' : 'bg-yellow-400'}`} />
              {isSupabaseConfigured ? 'Syncing' : 'No DB'}
            </div>

            {/* Unread badge (job mode only) */}
            {job && unreadCount > 0 && (
              <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-red-500/80 border border-red-400/40">
                <span>{unreadCount} unread</span>
              </div>
            )}

            {/* Profile link */}
            <Link
              href="/profile"
              className="text-xs px-3 py-1.5 rounded-full border border-white/30 bg-white/10 hover:bg-white/20 transition-colors"
              title="Your profile & gap analysis"
            >
              👤 Profile
            </Link>

            {/* Refresh (job mode only) */}
            {job && onRefresh && (
              <button
                onClick={onRefresh}
                disabled={refreshing}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-white/30 bg-white/10 hover:bg-white/20 transition-colors disabled:opacity-50"
              >
                <span className={refreshing ? 'animate-spin inline-block' : ''}>↻</span>
                {refreshing ? 'Fetching…' : 'Fetch Intel'}
              </button>
            )}

            {/* User avatar + sign out */}
            {user && (
              <div className="flex items-center gap-2 ml-1">
                {user.user_metadata?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.user_metadata.avatar_url}
                    alt={user.user_metadata?.full_name ?? 'User'}
                    className="w-7 h-7 rounded-full border-2 border-white/30"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-white/20 border-2 border-white/30 flex items-center justify-center text-xs font-bold">
                    {(user.user_metadata?.full_name ?? user.email ?? '?')[0].toUpperCase()}
                  </div>
                )}
                <button
                  onClick={handleSignOut}
                  className="text-xs opacity-60 hover:opacity-100 transition-opacity px-1"
                  title="Sign out"
                >
                  ⏏
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Job meta chips (job mode only) */}
        {job && (
          <div className="flex flex-wrap gap-2 mt-3">
            {(() => {
              const chips = []
              chips.push(
                <span key="status" className={`text-xs px-2.5 py-1 rounded-full border border-white/20 bg-white/10`}>
                  {JOB_STATUS_LABELS[job.status]}
                </span>
              )
              if (appliedStr) chips.push(
                <span key="applied" className="text-xs px-2.5 py-1 rounded-full border border-white/20 bg-white/10">
                  🎯 Applied {appliedStr}
                </span>
              )
              if (job.location) chips.push(
                <span key="loc" className="text-xs px-2.5 py-1 rounded-full border border-white/20 bg-white/10">
                  📍 {job.location}
                </span>
              )
              if (salaryStr) chips.push(
                <span key="sal" className="text-xs px-2.5 py-1 rounded-full border border-white/20 bg-white/10">
                  💰 {salaryStr}
                </span>
              )
              if (job.job_url) chips.push(
                <a key="jd" href={job.job_url} target="_blank" rel="noopener noreferrer"
                  className="text-xs px-2.5 py-1 rounded-full border border-white/20 bg-white/10 hover:bg-white/20 transition-colors">
                  📄 Job description ↗
                </a>
              )
              return chips
            })()}
          </div>
        )}
      </div>
    </header>
  )
}

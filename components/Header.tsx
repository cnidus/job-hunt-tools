'use client'

import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'

interface HeaderProps {
  unreadCount: number
  onRefresh: () => void
  refreshing: boolean
}

export default function Header({ unreadCount, onRefresh, refreshing }: HeaderProps) {
  const [user, setUser] = useState<User | null>(null)

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
  }, [])

  async function handleSignOut() {
    if (!supabase) return
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <header className="text-white" style={{ background: 'linear-gradient(135deg, #1a3a6b 0%, #3d74cc 100%)' }}>
      <div className="max-w-6xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">

          {/* Left: branding */}
          <div className="flex items-center gap-3">
            <div className="bg-white text-[#3d74cc] font-bold text-xs px-2.5 py-1 rounded-md tracking-wide">
              CLOCKWORK.IO
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">Research Hub</h1>
              <p className="text-xs opacity-75">Senior Solutions Engineer · Palo Alto, CA · $170K–$250K</p>
            </div>
          </div>

          {/* Right: meta + actions */}
          <div className="flex items-center gap-2">

            {/* Supabase / auth status */}
            <div className={`hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
              isSupabaseConfigured
                ? 'border-green-400/40 bg-green-400/10 text-green-200'
                : 'border-yellow-400/40 bg-yellow-400/10 text-yellow-200'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isSupabaseConfigured ? 'bg-green-400' : 'bg-yellow-400'}`} />
              {isSupabaseConfigured ? 'Syncing' : 'No DB'}
            </div>

            {/* Unread badge */}
            {unreadCount > 0 && (
              <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-red-500/80 border border-red-400/40">
                <span>{unreadCount} unread</span>
              </div>
            )}

            {/* Date */}
            <span className="hidden md:block text-xs opacity-70">{today}</span>

            {/* Refresh */}
            <button
              onClick={onRefresh}
              disabled={refreshing}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-white/30 bg-white/10 hover:bg-white/20 transition-colors disabled:opacity-50"
            >
              <span className={refreshing ? 'animate-spin inline-block' : ''}>↻</span>
              {refreshing ? 'Fetching…' : 'Fetch Intel'}
            </button>

            {/* User avatar + sign out */}
            {user && (
              <div className="flex items-center gap-2 ml-1">
                {/* Avatar */}
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
                {/* Sign out */}
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

        {/* Meta chips */}
        <div className="flex flex-wrap gap-2 mt-3">
          {[
            '🎯 Applied: Apr 8, 2026',
            '🏢 AI Fabrics · GPU Infrastructure',
            '💰 $20.5M Series (Sept 2025)',
            '📍 On-site · Palo Alto',
          ].map((chip) => (
            <span key={chip} className="text-xs px-2.5 py-1 rounded-full border border-white/20 bg-white/10">
              {chip}
            </span>
          ))}
        </div>
      </div>
    </header>
  )
}

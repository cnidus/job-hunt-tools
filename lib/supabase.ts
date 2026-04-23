import { createBrowserClient } from '@supabase/ssr'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''

/**
 * Supabase browser client (cookie-based sessions via @supabase/ssr).
 * Uses the "publishable key" (formerly "anon key").
 * Returns null if env vars are missing so the app degrades gracefully.
 *
 * Only import this in 'use client' components — for server/middleware
 * use createServerClient from @supabase/ssr directly.
 */
export const supabase = url && key ? createBrowserClient(url, key) : null

export const isSupabaseConfigured = !!supabase

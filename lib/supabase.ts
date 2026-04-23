import { createClient } from '@supabase/supabase-js'

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? ''
const key  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

/**
 * Supabase browser client.
 * If env vars are missing (local dev without .env.local),
 * the app falls back to localStorage — see lib/storage.ts.
 */
export const supabase = url && key ? createClient(url, key) : null

export const isSupabaseConfigured = !!supabase

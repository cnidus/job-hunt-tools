import { createClient } from '@supabase/supabase-js'

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const key  = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''

/**
 * Supabase browser client.
 * Uses the "publishable key" (Supabase's current naming for the safe,
 * client-side key — previously called "anon key").
 * If env vars are missing (local dev without .env.local),
 * the app returns null and storage calls are no-ops.
 */
export const supabase = url && key ? createClient(url, key) : null

export const isSupabaseConfigured = !!supabase

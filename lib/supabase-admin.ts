/**
 * lib/supabase-admin.ts
 *
 * Lazy factory for the Supabase service-role (admin) client.
 * Call getAdminClient() inside a request handler — never at module level —
 * so Next.js can evaluate the module during build without env vars present.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type AdminClient = SupabaseClient

export function getAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!url || !key) {
    throw new Error(
      'Supabase env vars not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)'
    )
  }

  return createClient(url, key)
}

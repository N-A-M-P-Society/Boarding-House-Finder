// src/lib/supabase.js
import { createServerClient } from '@supabase/ssr'

export function createRouteClient(req) {
  const authHeader = req.headers.get('authorization')

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return []
        },
        setAll() {},
      },
      global: {
        headers: authHeader ? { Authorization: authHeader } : {},
      },
    }
  )
}
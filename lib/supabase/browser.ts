'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config'
import { supabaseCookieOptions } from './cookies'

let client: SupabaseClient | null = null

/** Синглтон: несколько клиентов в одной вкладке дерутся за обновление токена. */
export function getSupabaseBrowser(): SupabaseClient {
  if (!client) {
    client = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      // Хост вкладки: тот же, что увидят сервер и proxy в заголовке Host.
      cookieOptions: supabaseCookieOptions(typeof window === 'undefined' ? null : window.location.host),
    })
  }
  return client
}

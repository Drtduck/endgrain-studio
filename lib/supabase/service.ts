import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_URL } from './config'

/**
 * Service-ключ живёт ТОЛЬКО на сервере: без префикса NEXT_PUBLIC Next его в
 * клиентский бандл не инлайнит. Импортировать этот модуль из клиентских
 * компонентов нельзя.
 */
const SERVICE_ROLE_KEY: string = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

/**
 * Приватный bucket читается и пишется в обход RLS, поэтому вложения фидбека
 * работают, только если service-ключ задан. Без него текстовый фидбек уходит
 * как раньше, а вложение помечается в issue как несохранённое.
 */
export function isSupabaseServiceConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SERVICE_ROLE_KEY.length > 0
}

export function getSupabaseService(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_URL } from './config'

export const SUPABASE_SERVICE_ROLE_KEY: string = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? ''

export function isSupabaseAdminConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_SERVICE_ROLE_KEY.length > 0
}

/**
 * Клиент, обходящий RLS. Используется ровно в одном месте: app/api/stripe/webhook.
 * Не createServerClient из @supabase/ssr: cookie тут не нужны и сессию заводить нельзя,
 * вебхук приходит от Stripe, а не от браузера пользователя.
 * Любое новое место вызова этой функции обязано быть обосновано в ревью.
 */
export function getSupabaseAdmin(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

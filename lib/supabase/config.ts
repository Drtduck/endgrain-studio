/**
 * Единственное место, где читаются публичные переменные Supabase.
 * Точечная нотация process.env.NEXT_PUBLIC_* обязательна: Next инлайнит эти
 * значения в клиентский бандл статическим разбором и индексную запись
 * process.env['NEXT_PUBLIC_...'] не видит.
 */
export const SUPABASE_URL: string = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
export const SUPABASE_ANON_KEY: string = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

/**
 * Аккаунт в студии необязателен, а в CI секретов нет вовсе. Поэтому любой код,
 * который собирается идти в Supabase, сначала спрашивает разрешения здесь:
 * без переменных приложение работает как раньше, на localStorage, и молчит.
 */
export function isSupabaseConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0
}

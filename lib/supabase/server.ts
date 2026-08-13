import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cookies, headers } from 'next/headers'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config'
import { supabaseCookieOptions } from './cookies'

export async function getSupabaseServer(): Promise<SupabaseClient> {
  const store = await cookies()
  // Домен cookie считается от хоста запроса, а не от константы сборки: иначе на
  // localhost и на превью браузер получил бы cookie боевого домена и выбросил её.
  const host = (await headers()).get('host')
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookieOptions: supabaseCookieOptions(host),
    cookies: {
      getAll() {
        return store.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) store.set(name, value, options)
        } catch {
          // В серверном компоненте запись cookie запрещена и бросает.
          // Это не ошибка: сессию продлевает proxy.ts до рендера.
        }
      },
    },
  })
}

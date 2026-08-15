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
        // Контракт: RSC никогда не пишет auth-cookie, это делает proxy.ts до
        // рендера (updateSession). Next.js запрещает store.set() вне Server
        // Action/Route Handler и здесь бросает - это ожидаемо, а не сбой.
        // Если getUser() всё же решит ротировать токен прямо в RSC (например
        // потому что proxy для этого маршрута не вызывался), новые cookie
        // будут потеряны молча - и следующий заход придёт с уже отозванным
        // refresh-токеном. console.warn чтобы такой пробел в маршрутах proxy
        // был виден в логах, а не превращался в тихий разлогин.
        try {
          for (const { name, value, options } of cookiesToSet) store.set(name, value, options)
        } catch {
          console.warn(
            '[supabase] setAll() из RSC не смог записать cookie ротации сессии - ' +
              'проверь, что proxy.ts вызывает updateSession() для этого маршрута',
          )
        }
      },
    },
  })
}

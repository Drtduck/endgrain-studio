import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from './config'

export interface SessionCheck {
  /** Ответ с уже выставленными Set-Cookie: его либо отдают, либо переносят cookie на редирект. */
  readonly response: NextResponse
  /** true, если getUser вернул живого пользователя. */
  readonly authenticated: boolean
}

/**
 * Продление сессии и проверка входа одним походом в Supabase. getUser здесь
 * вызывается ровно один раз: он и обновляет протухший access-токен (через setAll),
 * и отвечает на вопрос «пускать ли в студию». Два отдельных вызова стоили бы
 * лишнего round-trip на каждой навигации.
 */
export async function updateSession(request: NextRequest): Promise<SessionCheck> {
  if (!isSupabaseConfigured()) return { response: NextResponse.next(), authenticated: false }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options)
      },
    },
  })

  // Вызов обязателен: именно getUser обновляет протухший access-токен и
  // дёргает setAll. Без него сессия живёт ровно до истечения токена.
  let authenticated = false
  try {
    const { data } = await supabase.auth.getUser()
    authenticated = data.user != null
  } catch {
    // Сеть до Supabase не должна стоить пользователю 500 на статичной странице.
  }

  return { response, authenticated }
}

/**
 * Классические грабли @supabase/ssr: свежие токены лежат в Set-Cookie того
 * ответа, который вернул updateSession. Если вместо него отдать новый
 * NextResponse.redirect, браузер уедет на логин со старой (протухшей) парой
 * токенов и следующий заход снова окажется анонимным. Поэтому cookie
 * переносим руками на итоговый ответ.
 */
export function carryCookies(from: NextResponse, to: NextResponse): NextResponse {
  for (const cookie of from.cookies.getAll()) to.cookies.set(cookie)
  return to
}

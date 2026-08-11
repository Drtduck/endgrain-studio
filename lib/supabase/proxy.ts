import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from './config'

/**
 * Продление сессии и ничего больше. Приложение публичное: неавторизованного
 * никуда не уводим, закрытых маршрутов нет. Единственная задача - забрать
 * свежую пару токенов и донести Set-Cookie до браузера.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  if (!isSupabaseConfigured()) return NextResponse.next()

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
  try {
    await supabase.auth.getUser()
  } catch {
    // Сеть до Supabase не должна стоить пользователю 500 на статичной странице.
  }

  return response
}

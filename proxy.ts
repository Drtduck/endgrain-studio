import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { APP_ORIGIN, LANDING_PATH, SITE_ORIGIN, hostRole } from '@/lib/routing/host'
import { updateSession } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const role = hostRole(request.headers.get('host'))
  const path = request.nextUrl.pathname

  if (role === 'site') {
    // Лендинг статичен и анонимен: за сессией Supabase не ходим вовсе.
    if (path === '/') return NextResponse.rewrite(new URL(LANDING_PATH, request.url))
    if (path === LANDING_PATH) return NextResponse.next()
    // Всё остальное на корневом домене это студия: отправляем на поддомен,
    // сохраняя путь и query (например ссылку восстановления пароля из письма).
    return NextResponse.redirect(new URL(path + request.nextUrl.search, APP_ORIGIN), 307)
  }

  // Одна страница по двум адресам это две записи в индексе: канон у корневого домена.
  if (role === 'app' && path === LANDING_PATH) {
    return NextResponse.redirect(new URL(LANDING_PATH, SITE_ORIGIN), 308)
  }

  return updateSession(request)
}

// Матчер исключает статику и картинки: без него proxy отрабатывает даже на
// _next/static и превращает раздачу ассетов в поход за сессией.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)'],
}

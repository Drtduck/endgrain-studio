import { NextRequest, NextResponse } from 'next/server'
import { decideAccess } from '@/lib/auth/access'
import { COUNTRY_HEADER } from '@/lib/auth/geo'
import { flags } from '@/lib/flags'
import { APP_ORIGIN, LANDING_PATH, SITE_ORIGIN, hostRole } from '@/lib/routing/host'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { carryCookies, updateSession } from '@/lib/supabase/proxy'

/**
 * Vercel сам определяет страну по IP и кладёт её в x-vercel-ip-country. Переносим
 * значение в собственный заголовок запроса x-egs-country: так до серверных
 * компонентов (headers() в layout) доезжает наше имя, а не деталь платформы
 * хостинга, от которой мы не хотим зависеть напрямую в остальном коде.
 */
function withCountryHeader(request: NextRequest): NextRequest {
  const country = request.headers.get('x-vercel-ip-country')
  if (!country) return request
  const headers = new Headers(request.headers)
  headers.set(COUNTRY_HEADER, country)
  return new NextRequest(request, { headers })
}

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

  // Один поход в Supabase на переход: он же продлевает сессию, он же отвечает,
  // авторизован ли гость.
  const { response, authenticated } = await updateSession(withCountryHeader(request))

  const decision = decideAccess({
    role,
    pathname: path,
    search: request.nextUrl.search,
    authenticated,
    publicStudio: flags.publicStudio,
    supabaseConfigured: isSupabaseConfigured(),
  })

  if (decision.kind === 'redirect') {
    return carryCookies(response, NextResponse.redirect(new URL(decision.to, request.url), 307))
  }

  return response
}

// Матчер исключает статику и картинки: без него proxy отрабатывает даже на
// _next/static и превращает раздачу ассетов в поход за сессией.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)'],
}

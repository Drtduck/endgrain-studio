import { NextRequest, NextResponse } from 'next/server'
import { decideAccess } from '@/lib/auth/access'
import { COUNTRY_HEADER } from '@/lib/auth/geo'
import { flags } from '@/lib/flags'
import { APP_ORIGIN, BLOG_PATH, LANDING_PATH, SITE_ORIGIN, hostRole, isSitePath } from '@/lib/routing/host'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { carryCookies, updateSession } from '@/lib/supabase/proxy'

/** true для /blog и /blog/<что угодно>, но не для '/' - на app-домене '/' это студия, а не лендинг. */
function isBlogPath(pathname: string): boolean {
  return pathname === BLOG_PATH || pathname.startsWith(`${BLOG_PATH}/`)
}

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
  // Заголовок страны нужен на обоих доменах: лендинг тоже принимает решения по
  // региону (баннер согласия, opt-in/opt-out), а не только студия. Раньше
  // withCountryHeader() звался только в ветке app, и весь трафик на site-домене
  // (лендинг, блог) шёл с request без x-egs-country - каждый посетитель лендинга
  // получал region-агностичный opt-in вместо честного региона по IP.
  const requestWithCountry = withCountryHeader(request)
  const role = hostRole(requestWithCountry.headers.get('host'))
  const path = requestWithCountry.nextUrl.pathname

  // { request } пробрасывает мутированные заголовки (x-egs-country) дальше в
  // рендер, ровно как уже делает updateSession() в lib/supabase/proxy.ts.
  const forwardedHeaders = { headers: requestWithCountry.headers }

  if (role === 'site') {
    // Лендинг статичен и анонимен: за сессией Supabase не ходим вовсе.
    if (path === '/') return NextResponse.rewrite(new URL(LANDING_PATH, requestWithCountry.url), { request: forwardedHeaders })
    // Блог живёт на этом же домене вместе с лендингом (см. isSitePath).
    if (isSitePath(path)) return NextResponse.next({ request: forwardedHeaders })
    // API отдаём прямо на корневом домене: MCP-клиент, вбивший endgrain.app/api/mcp,
    // не обязан следовать 307-редиректу на POST (не все клиенты это делают), а
    // человек, который набрал этот адрес руками, не должен получить невнятную
    // ошибку. Роуты те же самые, приложение одно - разводить их незачем.
    if (path.startsWith('/api/')) {
      return NextResponse.rewrite(new URL(path + requestWithCountry.nextUrl.search, requestWithCountry.url), { request: forwardedHeaders })
    }
    // Всё остальное на корневом домене это студия: отправляем на поддомен,
    // сохраняя путь и query (например ссылку восстановления пароля из письма).
    // Редирект не несёт наш собственный заголовок дальше: страна там определится
    // заново, уже на app-домене, тем же кодом.
    return NextResponse.redirect(new URL(path + requestWithCountry.nextUrl.search, APP_ORIGIN), 307)
  }

  // Одна страница по двум адресам это две записи в индексе: канон у корневого домена.
  // То же самое для блога: app.endgrain.app/blog/что-угодно не должен плодить
  // вторую копию статьи по второму домену.
  if (role === 'app' && (path === LANDING_PATH || isBlogPath(path))) {
    return NextResponse.redirect(new URL(path, SITE_ORIGIN), 308)
  }

  // API-запросы агентов не несут cookie-сессию Supabase и не могут её нести:
  // поход в updateSession на каждый вызов это лишние 50-150 мс и лишний запрос
  // к базе без единой пользы. Проверка ключа (lib/api/auth.ts) не имеет с
  // сессией ничего общего.
  if (role === 'app' && (path.startsWith('/api/v1/') || path === '/api/mcp')) {
    return NextResponse.next({ request: forwardedHeaders })
  }

  // Один поход в Supabase на переход: он же продлевает сессию, он же отвечает,
  // авторизован ли гость.
  const { response, authenticated } = await updateSession(requestWithCountry)

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

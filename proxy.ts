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

  // API-запросы агентов не несут cookie-сессию Supabase и не могут её нести:
  // поход в updateSession на каждый вызов это лишние 50-150 мс и лишний запрос
  // к базе без единой пользы. Проверка ключа (lib/api/auth.ts) не имеет с
  // сессией ничего общего. На site-домене та же самая API-семья живёт под тем
  // же /api/ (см. комментарий ниже про рероут), поэтому исключаем её здесь же.
  if (role === 'site' && path.startsWith('/api/')) {
    // MCP-клиент, вбивший endgrain.app/api/mcp, не обязан следовать 307-редиректу
    // на POST (не все клиенты это делают), а человек, который набрал этот адрес
    // руками, не должен получить невнятную ошибку. Роуты те же самые, приложение
    // одно - разводить их незачем.
    return NextResponse.rewrite(new URL(path + requestWithCountry.nextUrl.search, requestWithCountry.url), { request: forwardedHeaders })
  }
  if (role === 'app' && (path.startsWith('/api/v1/') || path === '/api/mcp')) {
    return NextResponse.next({ request: forwardedHeaders })
  }

  // Один поход в Supabase на переход: он же продлевает сессию, он же отвечает,
  // авторизован ли гость. Раньше на site-домене (лендинг, весь /blog) сюда не
  // заходили вовсе, считая его анонимным - но getCurrentUser() в
  // app/layout.tsx дёргает getUser() для ВСЕХ маршрутов, включая блог. Когда
  // access-токен протухал прямо на этом домене, ротацию refresh-токена делал
  // Server Component, где cookie молча терялись (см. lib/supabase/server.ts),
  // а следующий заход на app-домен уже нёс отозванный refresh и разлогинивал.
  // Теперь и здесь сессию продлевает proxy - единственное место, которому
  // разрешено писать auth-cookie.
  const { response, authenticated } = await updateSession(requestWithCountry)

  if (role === 'site') {
    // Лендинг сам по себе анонимен, но сессия должна продлеваться и здесь
    // (см. комментарий выше) - поэтому cookie из updateSession несём дальше
    // на rewrite и next() точно так же, как ниже несём их на редирект.
    if (path === '/') {
      return carryCookies(response, NextResponse.rewrite(new URL(LANDING_PATH, requestWithCountry.url), { request: forwardedHeaders }))
    }
    // Блог живёт на этом же домене вместе с лендингом (см. isSitePath).
    if (isSitePath(path)) {
      return carryCookies(response, NextResponse.next({ request: forwardedHeaders }))
    }
    // Всё остальное на корневом домене это студия: отправляем на поддомен,
    // сохраняя путь и query (например ссылку восстановления пароля из письма).
    // Редирект не несёт наш собственный заголовок дальше: страна там определится
    // заново, уже на app-домене, тем же кодом.
    return carryCookies(response, NextResponse.redirect(new URL(path + requestWithCountry.nextUrl.search, APP_ORIGIN), 307))
  }

  // Одна страница по двум адресам это две записи в индексе: канон у корневого домена.
  // То же самое для блога: app.endgrain.app/blog/что-угодно не должен плодить
  // вторую копию статьи по второму домену.
  if (role === 'app' && (path === LANDING_PATH || isBlogPath(path))) {
    return carryCookies(response, NextResponse.redirect(new URL(path, SITE_ORIGIN), 308))
  }

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

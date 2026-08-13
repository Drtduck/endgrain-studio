import { isSecureCookieHost, registrableCookieDomain } from '@/lib/routing/cookieDomain'

export interface SupabaseCookieOptions {
  readonly name: string
  readonly domain?: string
  readonly path: string
  readonly sameSite: 'lax'
  readonly secure: boolean
}

/**
 * Имя задано явно вместо дефолтного sb-<ref>-auth-token: при выкате старые host-only
 * cookie осиротеют, и текущие сессии один раз попросят войти заново. Это дешевле,
 * чем логика схлопывания дублей.
 */
export const SUPABASE_COOKIE_NAME = 'sb-egs-auth'

/**
 * Общие опции auth-cookie для всех трёх клиентов Supabase (браузер, сервер, proxy).
 * Домен считается от реального хоста: в браузере это window.location.host, на сервере
 * и в proxy заголовок Host запроса. Все три обязаны получить один и тот же домен, иначе
 * браузер получит две cookie с одним именем (host-only и domain-wide) и авторизация
 * начнёт плавать через раз.
 * На боевых доменах домен шире хоста сознательно: модалка входа живёт на лендинге
 * endgrain.app, а студия на app.endgrain.app, и host-only cookie на поддомен не уедет.
 * Цена решения: auth-cookie читает любой поддомен endgrain.app, поэтому на поддоменах
 * нельзя размещать чужой или пользовательский контент, а на лендинг нельзя тащить
 * сторонние скрипты.
 * На localhost, по IP и на превью *.vercel.app домен не ставится: cookie остаётся
 * host-only и работает, а лишний domain браузер отбросил бы вместе с сессией.
 */
export function supabaseCookieOptions(host: string | null | undefined): SupabaseCookieOptions {
  // Хоста нет только у синтетических запросов: host-only cookie без secure работает везде.
  const domain = host ? registrableCookieDomain(host) : undefined
  return {
    name: SUPABASE_COOKIE_NAME,
    // Ключ domain отсутствует целиком, а не равен undefined: иначе cookie получит
    // пустой домен и браузер её отбросит.
    ...(domain === undefined ? {} : { domain }),
    path: '/',
    sameSite: 'lax',
    secure: host ? isSecureCookieHost(host) : false,
  }
}

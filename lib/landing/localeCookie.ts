import { registrableCookieDomain } from '@/lib/routing/cookieDomain'

/**
 * Имя cookie с языком вынесено из lib/landing/locale.ts отдельно: тот модуль тянет
 * next/headers и в клиентский бандл попасть не может, а приложение пишет ту же cookie руками.
 */
export const LOCALE_COOKIE = 'eg-locale'

export const LOCALE_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 365

/**
 * Домен cookie с языком это тот же регистрируемый домен, что и у сессии Supabase:
 * логика одна, поэтому она живёт в lib/routing/cookieDomain.ts, а здесь остаётся имя,
 * под которым её знает лендинг.
 */
export const localeCookieDomain = registrableCookieDomain

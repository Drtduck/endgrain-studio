import { cookies } from 'next/headers'
import type { Locale } from '@/lib/i18n'
import { LOCALE_COOKIE, localeCookieDomain } from './localeCookie'

/**
 * Лендинг рендерится на сервере, а локаль приложения живёт в zustand на клиенте и
 * серверу недоступна. Поэтому у лендинга своя cookie: SSR получается
 * детерминированным (никакого мигания языка), поисковик видит финальный текст,
 * а e2e просто выставляет cookie перед переходом.
 */
export { LOCALE_COOKIE, localeCookieDomain }

export async function getLandingLocale(): Promise<Locale> {
  const store = await cookies()
  return store.get(LOCALE_COOKIE)?.value === 'en' ? 'en' : 'ru'
}

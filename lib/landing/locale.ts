import { cookies } from 'next/headers'
import type { Locale } from '@/lib/i18n'

/**
 * Лендинг рендерится на сервере, а локаль студии живёт в zustand на клиенте и
 * серверу недоступна. Поэтому у лендинга своя cookie: SSR получается
 * детерминированным (никакого мигания языка), поисковик видит финальный текст,
 * а e2e просто выставляет cookie перед переходом.
 */
export const LOCALE_COOKIE = 'eg-locale'

export async function getLandingLocale(): Promise<Locale> {
  const store = await cookies()
  return store.get(LOCALE_COOKIE)?.value === 'en' ? 'en' : 'ru'
}

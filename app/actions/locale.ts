'use server'

import { cookies, headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { LOCALE_COOKIE, localeCookieDomain } from '@/lib/landing/locale'
import { LOCALE_COOKIE_MAX_AGE_S } from '@/lib/landing/localeCookie'
import { LANDING_PATH } from '@/lib/routing/host'

export async function setLandingLocaleAction(next: string): Promise<void> {
  const value = next === 'en' ? 'en' : 'ru'
  const store = await cookies()
  // Домен с точкой спереди, чтобы язык доехал вместе с человеком на app.-поддомен.
  // Считается от хоста запроса: на localhost домена нет, и клиентский rememberLocale
  // пишет ровно такую же host-only cookie.
  const domain = localeCookieDomain((await headers()).get('host') ?? '')
  store.set(LOCALE_COOKIE, value, {
    path: '/',
    maxAge: LOCALE_COOKIE_MAX_AGE_S,
    sameSite: 'lax',
    ...(domain ? { domain } : {}),
  })
  revalidatePath(LANDING_PATH)
}

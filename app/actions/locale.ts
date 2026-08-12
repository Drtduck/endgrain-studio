'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { LOCALE_COOKIE } from '@/lib/landing/locale'
import { LANDING_PATH } from '@/lib/routing/host'

export async function setLandingLocaleAction(next: string): Promise<void> {
  const value = next === 'en' ? 'en' : 'ru'
  const store = await cookies()
  store.set(LOCALE_COOKIE, value, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
  revalidatePath(LANDING_PATH)
}

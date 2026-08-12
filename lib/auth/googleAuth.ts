import { cache } from 'react'
import { headers } from 'next/headers'
import { COUNTRY_HEADER, hiddenCountries, isGoogleAuthAvailable } from './geo'

/**
 * Флаг, доступна ли кнопка «Войти через Google», на один серверный рендер.
 * Заголовок кладёт proxy.ts из x-vercel-ip-country; без него (локалка, превью
 * вне Vercel) считаем доступным, чтобы не ломать разработку.
 */
export const getGoogleAuthAvailable = cache(async (): Promise<boolean> => {
  const store = await headers()
  const country = store.get(COUNTRY_HEADER)
  return isGoogleAuthAvailable(country, hiddenCountries())
})

import { cache } from 'react'
import { cookies, headers } from 'next/headers'
import { COUNTRY_HEADER } from '@/lib/auth/geo'
import { CONSENT_COOKIE, type ConsentDecision, parseConsent } from './cookie'
import { type ConsentRegime, consentRegime } from './regions'

export interface ConsentContext {
  readonly country: string | null
  readonly regime: ConsentRegime
  readonly decision: ConsentDecision | null
}

/**
 * Один расчёт на серверный рендер, ровно как getGoogleAuthAvailable: читает
 * headers() и cookies() один раз и отдаёт результат клиенту пропом в корневом
 * layout, чтобы баннер не мигал и не дёргал эффект на клиенте.
 */
export const getConsentContext = cache(async (): Promise<ConsentContext> => {
  const store = await headers()
  const country = store.get(COUNTRY_HEADER)
  const jar = await cookies()
  const decision = parseConsent(jar.get(CONSENT_COOKIE)?.value)
  return { country, regime: consentRegime(country), decision }
})

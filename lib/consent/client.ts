import { isSecureCookieHost, registrableCookieDomain } from '@/lib/routing/cookieDomain'
import { CONSENT_COOKIE, CONSENT_MAX_AGE_S, type ConsentDecision, parseConsent, serializeConsent } from './cookie'

/** Читает и парсит cookie согласия из document.cookie текущей страницы. */
export function readConsent(): ConsentDecision | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${CONSENT_COOKIE}=`))
  if (match === undefined) return null
  return parseConsent(decodeURIComponent(match.slice(CONSENT_COOKIE.length + 1)))
}

/**
 * Пишет решение в cookie у самого гостя. Домен и Secure считаются от текущего
 * хоста тем же способом, что и на сервере (lib/routing/cookieDomain.ts): выбор,
 * сделанный на лендинге, обязан доехать до app.endgrain.app без повторного вопроса.
 * Не HttpOnly сознательно: cookie пишет и читает клиент, сервер только читает при рендере.
 */
export function writeConsent(decision: ConsentDecision): void {
  if (typeof document === 'undefined') return
  const host = window.location.host
  const domain = registrableCookieDomain(host)
  const secure = isSecureCookieHost(host)
  const parts = [
    `${CONSENT_COOKIE}=${encodeURIComponent(serializeConsent(decision))}`,
    'Path=/',
    `Max-Age=${CONSENT_MAX_AGE_S}`,
    'SameSite=Lax',
  ]
  if (domain !== undefined) parts.push(`Domain=${domain}`)
  if (secure) parts.push('Secure')
  document.cookie = parts.join('; ')
}

/** navigator.globalPrivacyControl с защитой от отсутствия navigator (SSR, старые браузеры). */
export function detectGpc(): boolean {
  if (typeof navigator === 'undefined') return false
  return (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true
}

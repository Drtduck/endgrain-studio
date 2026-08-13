import type { ConsentRegime } from './regions'

export const CONSENT_COOKIE = 'eg-consent'

/**
 * Значение с другой версией считается отсутствующим: изменился состав обработки,
 * значит спрашиваем заново. Дешёвый механизм пересогласия без миграций.
 */
export const CONSENT_VERSION = 1

/** 180 суток - общая практика ЕС для срока жизни согласия на cookie. */
export const CONSENT_MAX_AGE_S = 60 * 60 * 24 * 180

export type ConsentSource = 'banner' | 'gpc' | 'settings'

export interface ConsentDecision {
  readonly analytics: boolean
  readonly regime: ConsentRegime
  readonly source: ConsentSource
  /** unix-секунды на момент решения. */
  readonly at: number
}

const SOURCES: readonly ConsentSource[] = ['banner', 'gpc', 'settings']
const REGIMES: readonly ConsentRegime[] = ['opt-in', 'opt-out']

/**
 * Точка как разделитель, а не JSON: значение остаётся URL-safe без кодирования,
 * парсится split('.') в пять строк и видно глазами в DevTools при ручной проверке.
 */
export function serializeConsent(decision: ConsentDecision): string {
  const analyticsBit = decision.analytics ? '1' : '0'
  return `${CONSENT_VERSION}.${analyticsBit}.${decision.regime}.${decision.source}.${Math.trunc(decision.at)}`
}

/**
 * Поломанное, обрезанное или чужое значение - это null, то есть «выбора нет».
 * Никаких исключений, никаких частичных разборов.
 */
export function parseConsent(raw: string | undefined | null): ConsentDecision | null {
  if (typeof raw !== 'string' || raw.length === 0) return null
  const parts = raw.split('.')
  if (parts.length !== 5) return null
  const [versionRaw, analyticsRaw, regimeRaw, sourceRaw, atRaw] = parts
  if (versionRaw !== String(CONSENT_VERSION)) return null
  if (analyticsRaw !== '0' && analyticsRaw !== '1') return null
  if (!REGIMES.includes(regimeRaw as ConsentRegime)) return null
  if (!SOURCES.includes(sourceRaw as ConsentSource)) return null
  if (!/^\d+$/.test(atRaw ?? '')) return null
  const at = Number(atRaw)
  if (!Number.isFinite(at)) return null
  return {
    analytics: analyticsRaw === '1',
    regime: regimeRaw as ConsentRegime,
    source: sourceRaw as ConsentSource,
    at,
  }
}

/**
 * Правило приоритета из раздела 2 спеки: `granted`, принятый в режиме `opt-out`
 * (например в США), при переезде в `opt-in` (ЕС/РФ) согласием не считается -
 * человек фактически выбора там не делал, аналитика была включена по умолчанию.
 * Обратный переезд (осознанное opt-in согласие едет в opt-out) остаётся валидным.
 * `denied` валиден всегда: отказ есть отказ независимо от региона.
 */
export function isDecisionValidFor(decision: ConsentDecision | null, regime: ConsentRegime): boolean {
  if (decision === null) return false
  if (!decision.analytics) return true
  if (decision.regime === 'opt-out' && regime === 'opt-in') return false
  return true
}

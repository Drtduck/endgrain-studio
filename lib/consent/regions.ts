/**
 * Список стран, где аналитика по умолчанию выключена до явного согласия (opt-in):
 * ЕС (27), ЕЭЗ (IS LI NO), Великобритания и Швейцария (UK GDPR, FADP) и РФ (420-ФЗ).
 * Используется дважды: как правило выбора баннера (consentRegime) и как значение
 * region в gtag('consent','default', ...) в lib/analytics/consentMode.ts, поэтому
 * объявлен один раз здесь, а не скопирован в оба места.
 */
export const OPT_IN_COUNTRIES: readonly string[] = [
  // Европейский союз (27)
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE',
  'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  // ЕЭЗ вне ЕС
  'IS', 'LI', 'NO',
  // UK GDPR и швейцарский FADP
  'GB', 'CH',
  // 420-ФЗ
  'RU',
]

export type ConsentRegime = 'opt-in' | 'opt-out'

/**
 * Режим по коду страны. Пустое, отсутствующее или незнакомое значение даёт `opt-in`:
 * строгий дефолт для localhost, превью вне Vercel и e2e, где заголовка страны нет.
 * Промах в сторону строгости стоит куска статистики, промах в другую сторону - штрафа.
 */
export function consentRegime(country: string | null | undefined): ConsentRegime {
  const normalized = (country ?? '').trim().toUpperCase()
  if (normalized.length === 0) return 'opt-in'
  return OPT_IN_COUNTRIES.includes(normalized) ? 'opt-in' : 'opt-out'
}

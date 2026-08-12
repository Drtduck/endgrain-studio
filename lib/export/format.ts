import { t, type Locale } from '@/lib/i18n'
import { formatMm, type UnitSystem } from '@/lib/units'

// Имя породы живёт в справочнике пород: экспорт и диагностики берут одну и ту же функцию.
export { speciesName } from '@/lib/species'

export function oneUnit(mm: number, unit: UnitSystem, locale: Locale, digits = 1): string {
  return formatMm(mm, unit, t(locale, 'units.mm'), digits)
}

/**
 * Обе системы разом: печатная инструкция обязана быть читаемой и для метрического цеха,
 * и для дюймового, а листать её ради переключателя единиц человек с фуганком не будет.
 * formatMm(mm, 'in', ...) игнорирует unitLabel и всегда сама печатает символ ", поэтому
 * вторым аргументом ниже передаётся пустая строка - это не забытый параметр, а особенность formatMm.
 */
export function bothUnits(mm: number, locale: Locale, digits = 1): string {
  return `${formatMm(mm, 'mm', t(locale, 'units.mm'), digits)} (${formatMm(mm, 'in', '', 2)})`
}

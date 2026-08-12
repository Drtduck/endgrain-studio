export type UnitSystem = 'mm' | 'in'

export const MM_PER_INCH = 25.4
export const MM3_PER_BOARD_FOOT = 144 * MM_PER_INCH ** 3 // 2359737.216

export function mmToInch(mm: number): number {
  return mm / MM_PER_INCH
}

export function inchToMm(inch: number): number {
  return inch * MM_PER_INCH
}

export function mm3ToBoardFeet(mm3: number): number {
  return mm3 / MM3_PER_BOARD_FOOT
}

/**
 * Единственное место, где миллиметры превращаются в текст.
 * unitLabel - локализованная подпись мм (для дюймов используется символ "). Берётся из i18n
 * ключом units.mm вызывающим кодом, чтобы этот модуль не знал о языке.
 */
export function formatMm(mm: number, unit: 'mm' | 'in', unitLabel: string, digits = 1): string {
  return unit === 'mm' ? `${mm.toFixed(digits)} ${unitLabel}` : `${mmToInch(mm).toFixed(2)}"`
}

function trimZeros(text: string): string {
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text
}

/**
 * Значение для поля ввода: голое число без подписи единиц.
 * Миллиметры округляются до сотых, дюймы до тысячных: столяр работает
 * шестнадцатыми (1/16" = 0.0625"), и на двух знаках перенабор 1/8" уехал бы
 * на 0.127 мм на каждом резе. Это только представление, документ хранит точные
 * миллиметры, поэтому поле не коммитит значение, которого человек не касался
 * (см. NumberFieldMm).
 */
export function mmToDisplay(mm: number, unit: UnitSystem): string {
  if (!Number.isFinite(mm)) return ''
  return unit === 'mm' ? trimZeros(mm.toFixed(2)) : trimZeros(mmToInch(mm).toFixed(3))
}

/** Разбор пользовательского ввода. Запятая как десятичный разделитель принимается. */
export function displayToMm(text: string, unit: UnitSystem): number | null {
  const normalized = text.trim().replace(',', '.')
  if (normalized === '') return null
  const value = Number(normalized)
  if (!Number.isFinite(value)) return null
  return unit === 'mm' ? value : inchToMm(value)
}

/** Шаг стрелок в поле: 1 мм или 1/16 дюйма. */
export function unitStepMm(unit: UnitSystem): number {
  return unit === 'mm' ? 1 : MM_PER_INCH / 16
}

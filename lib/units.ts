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

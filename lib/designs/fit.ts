/**
 * Единственное место, где решается, какой ширины бывает полоса в сгенерированном узоре.
 * Движковый минимум 4 мм соблюдается с запасом: полоса 4 мм склеивается, но в рисунке
 * не читается, а доска из таких полос выглядит как ошибка генератора, а не как узор.
 */
export const MIN_CELL_MM = 8
export const MAX_CELL_MM = 45
/** Рейсмус 330 мм минус запас на дрожание ширин при мутации. */
export const MAX_PANEL_WIDTH_MM = 320
/** Движок отбивает габарит меньше 50 мм ошибкой DIMENSION_SANITY, берём с запасом. */
export const MIN_BOARD_SPAN_MM = 60

export interface FitOptions {
  readonly min?: number
  readonly max?: number
  readonly minTotal?: number
  readonly maxTotal?: number
}

export function roundHalf(mm: number): number {
  return Math.round(mm * 2) / 2
}

export function sumMm(list: readonly number[]): number {
  return list.reduce((acc, value) => acc + value, 0)
}

function clampRound(mm: number, min: number, max: number): number {
  if (!Number.isFinite(mm)) return min
  return roundHalf(Math.min(max, Math.max(min, mm)))
}

/**
 * Подгонка списка ширин под изготовимость: каждая полоса в допуске, сумма в габарите.
 * Масштабирование идёт в несколько проходов, потому что после умножения на коэффициент
 * часть полос снова упирается в min или max и сумма уезжает.
 */
export function fitWidths(widths: readonly number[], opts: FitOptions = {}): number[] {
  const min = opts.min ?? MIN_CELL_MM
  const max = opts.max ?? MAX_CELL_MM
  const minTotal = opts.minTotal ?? MIN_BOARD_SPAN_MM
  const maxTotal = opts.maxTotal ?? MAX_PANEL_WIDTH_MM

  if (widths.length === 0) return []

  // По минимальной ширине в габарит влезает ограниченное число полос: лишние отсекаем,
  // иначе никакое масштабирование уже не спасёт.
  const maxCount = Math.max(1, Math.floor(maxTotal / min))
  let out = widths.slice(0, maxCount).map((w) => clampRound(w, min, max))

  for (let pass = 0; pass < 4; pass += 1) {
    const total = sumMm(out)
    if (total >= minTotal && total <= maxTotal) break
    if (total <= 0) break
    const factor = total > maxTotal ? maxTotal / total : minTotal / total
    out = out.map((w) => clampRound(w * factor, min, max))
  }

  // Последний рубеж: если после масштабирования сумма всё ещё выше потолка (так бывает
  // при упоре всех полос в min), режем список, а не выдаём непроходную панель.
  while (out.length > 1 && sumMm(out) > maxTotal) out.pop()

  return out
}

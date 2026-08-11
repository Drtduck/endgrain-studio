import type { BoardModel } from '@/lib/engine'

/** Ширина колонки с номерами рядов, мм в системе координат viewBox. */
export const ROW_LABEL_MARGIN_MM = 14

export interface BoardLayout {
  /** Сдвиг доски вправо: 0 без колонки номеров, ROW_LABEL_MARGIN_MM с ней. */
  readonly marginMm: number
  readonly totalWidthMm: number
  readonly totalHeightMm: number
  readonly viewBox: string
  /** Множитель мм -> px, чтобы наибольшая сторона уложилась в maxPx. */
  readonly scale: number
  readonly widthPx: number
  readonly heightPx: number
}

export interface BoardLayoutOptions {
  readonly maxPx?: number
  readonly withRowLabels?: boolean
  /** Дополнительная высота под заголовок и подпись, мм. Экран её не использует, экспорт использует. */
  readonly captionMm?: number
}

/**
 * Единственное место, где считается геометрия 2D-сцены доски.
 * И экранный BoardSvg, и экспортный renderBoardSvg берут числа отсюда,
 * поэтому «в экспорте выглядит иначе» не может случиться незаметно.
 */
export function boardLayout(
  model: Pick<BoardModel, 'widthMm' | 'lengthMm'>,
  options: BoardLayoutOptions = {},
): BoardLayout {
  const maxPx = options.maxPx ?? 640
  const marginMm = options.withRowLabels === true ? ROW_LABEL_MARGIN_MM : 0
  const captionMm = options.captionMm ?? 0
  const totalWidthMm = model.widthMm + marginMm
  const totalHeightMm = model.lengthMm + captionMm
  const longest = Math.max(totalWidthMm, totalHeightMm)
  // Пустая модель приходит из compile при битом документе: масштаб 0 честнее NaN.
  const scale = longest > 0 ? maxPx / longest : 0
  return {
    marginMm,
    totalWidthMm,
    totalHeightMm,
    viewBox: `0 0 ${totalWidthMm} ${totalHeightMm}`,
    scale,
    widthPx: totalWidthMm * scale,
    heightPx: totalHeightMm * scale,
  }
}

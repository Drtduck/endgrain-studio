import type { MerchProductId } from './types'

/**
 * Координаты товара в каталоге Printful: что заказывать генератору мокапов.
 *
 * Цифры сверены с живым каталогом 12.08.2026 через GET /products/{id} и
 * GET /v2/catalog-products/{id}/mockup-styles. Проверка была не лишней: id 186,
 * записанный в проекте как фартук, на самом деле «Black Foot Sublimated Socks».
 * Настоящий фартук это 894 «All-Over Print Apron».
 */
export interface PrintfulPlacement {
  /** Товар в каталоге Printful. */
  readonly productId: number
  /** Конкретный вариант: цвет и размер. Мокап рисуется именно для варианта. */
  readonly variantId: number
  /** Название области печати: front у одежды, default у кружки и постера. */
  readonly placement: string
  /**
   * Размер области печати в пикселях, посчитанный как дюймы * dpi из
   * mockup-styles. Позиция макета задаётся в этой же системе координат.
   */
  readonly areaWidthPx: number
  readonly areaHeightPx: number
}

export const PRINTFUL_PLACEMENTS: Readonly<Record<MerchProductId, PrintfulPlacement>> = {
  // Unisex Staple T-Shirt | Bella + Canvas 3001, вариант M White. 12 x 16 дюймов при 150 dpi.
  tshirt: { productId: 71, variantId: 4012, placement: 'front', areaWidthPx: 1800, areaHeightPx: 2400 },
  // White Glossy Mug, вариант 11 oz. 9 x 3.5 дюймов при 300 dpi: полоса вокруг цилиндра.
  mug: { productId: 19, variantId: 1320, placement: 'default', areaWidthPx: 2700, areaHeightPx: 1050 },
  // Enhanced Matte Paper Poster (in), вариант 18 x 24 дюйма при 300 dpi.
  poster: { productId: 1, variantId: 1, placement: 'default', areaWidthPx: 5400, areaHeightPx: 7200 },
  // All-Over Print Apron, единственный вариант 22903. 29 x 31.89 дюймов при 150 dpi.
  apron: { productId: 894, variantId: 22903, placement: 'front', areaWidthPx: 4350, areaHeightPx: 4783 },
}

/** Прямоугольник макета внутри области печати, в пикселях области. */
export interface PrintfulPosition {
  readonly area_width: number
  readonly area_height: number
  readonly width: number
  readonly height: number
  readonly top: number
  readonly left: number
}

/**
 * Узор доски квадратный, а области печати вытянутые. Вписываем квадрат по
 * меньшей стороне и центрируем: обрезать рисунок нельзя (Printful печатает то,
 * что прислали, целиком), растягивать тем более, иначе шашка поедет в ромб.
 *
 * У кружки полоса печати сильно шире, чем выше, и квадрат по высоте занимает
 * меньше половины ширины: это нормальный «медальон» по центру кружки.
 */
export function centeredSquare(area: PrintfulPlacement): PrintfulPosition {
  const side = Math.min(area.areaWidthPx, area.areaHeightPx)
  return {
    area_width: area.areaWidthPx,
    area_height: area.areaHeightPx,
    width: side,
    height: side,
    top: Math.round((area.areaHeightPx - side) / 2),
    left: Math.round((area.areaWidthPx - side) / 2),
  }
}

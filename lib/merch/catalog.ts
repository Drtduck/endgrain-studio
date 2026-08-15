import type { MerchProductId } from '../promo/types'

/**
 * Ряд размеров товара мерча. У футболки полный ряд S-XL, у остальных товаров
 * ровно один размер 'one' (§1 docs/specs/merch-orders.md).
 */
export type MerchSize = 's' | 'm' | 'l' | 'xl' | 'one'

/**
 * Вариант товара для заказа: то, чего не хватает `PRINTFUL_PLACEMENTS`
 * (`lib/promo/printfulCatalog.ts`) для продажи - там ровно один «показательный»
 * вариант на товар (у футболки M White), а заказу нужен весь ряд размеров.
 * Этот файл расширяет каталог мокапов, а не заменяет его.
 */
export interface MerchVariant {
  readonly productId: MerchProductId
  readonly size: MerchSize
  readonly variantId: number
  /** Снимок цены Printful за печать, центы. Сверено скриптом scripts/printful-catalog.ts. */
  readonly costCents: number
  /** Снимок худшей ставки доставки по allowed_countries (§2.5), центы. */
  readonly shipCents: number
}

/**
 * Снимок каталога Printful. Сверено 15.08.2026 скриптом scripts/printful-catalog.ts
 * на живом ключе (store_id 18602847). GET /products/71 подтвердил весь ряд
 * размеров футболки Bella+Canvas 3001, White буквально по гипотезе §1.1:
 * S=4011, M=4012, L=4013, XL=4014, все по $11.69. Себестоимость остальных
 * трёх товаров снята тем же запуском по их product_id: mug (19) White Glossy
 * Mug 11 oz = $5.95, poster (1) Enhanced Matte Paper Poster 18"x24" = $12.89,
 * apron (894) All-Over Print Apron White = $22.54.
 *
 * Ставка доставки (shipCents) - худшая по allowed_countries (§2.4, §2.5 спеки),
 * снята тем же запуском через POST /shipping/rates на тестовый адрес в
 * Мельбурне, Австралия (courier: Flat Rate, единственная предложенная ставка
 * на этот адрес): tshirt $7.69, mug $8.39, poster $6.69, apron $13.49.
 * Как и cost_variant, это снимок, а не живой запрос: причины см. §2.2 спеки.
 *
 * Цвет футболки один - белый, 2XL нет: обе оговорки из §1.1 спеки.
 */
export const MERCH_VARIANTS: readonly MerchVariant[] = [
  { productId: 'tshirt', size: 's', variantId: 4011, costCents: 1169, shipCents: 769 },
  { productId: 'tshirt', size: 'm', variantId: 4012, costCents: 1169, shipCents: 769 },
  { productId: 'tshirt', size: 'l', variantId: 4013, costCents: 1169, shipCents: 769 },
  { productId: 'tshirt', size: 'xl', variantId: 4014, costCents: 1169, shipCents: 769 },
  { productId: 'mug', size: 'one', variantId: 1320, costCents: 595, shipCents: 839 },
  { productId: 'poster', size: 'one', variantId: 1, costCents: 1289, shipCents: 669 },
  { productId: 'apron', size: 'one', variantId: 22903, costCents: 2254, shipCents: 1349 },
]

/** Допустимые размеры товара. mug/poster/apron принимают только 'one', футболка только s|m|l|xl. */
export const MERCH_SIZES_BY_PRODUCT: Readonly<Record<MerchProductId, readonly MerchSize[]>> = {
  tshirt: ['s', 'm', 'l', 'xl'],
  mug: ['one'],
  poster: ['one'],
  apron: ['one'],
}

/** Ищет вариант по товару и размеру. undefined - недопустимая пара, не молчаливая подмена. */
export function findMerchVariant(productId: MerchProductId, size: MerchSize): MerchVariant | undefined {
  return MERCH_VARIANTS.find((v) => v.productId === productId && v.size === size)
}

/** Тот же поиск, но кидает: для мест, где пара уже проверена схемой и её отсутствие - баг кода. */
export function merchVariant(productId: MerchProductId, size: MerchSize): MerchVariant {
  const variant = findMerchVariant(productId, size)
  if (variant === undefined) {
    throw new Error(`merch: нет варианта ${productId}/${size} в каталоге`)
  }
  return variant
}

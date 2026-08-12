import type { MessageKey } from '@/lib/i18n'

/** Четыре кадра продуктовой серии для карточки товара в магазине. */
export type PromoShotKind = 'hero' | 'lifestyle' | 'macro' | 'package'

export const PROMO_SHOTS: readonly PromoShotKind[] = ['hero', 'lifestyle', 'macro', 'package']

export interface PromoShotMeta {
  readonly kind: PromoShotKind
  readonly titleKey: MessageKey
  readonly noteKey: MessageKey
}

export const PROMO_SHOT_META: readonly PromoShotMeta[] = [
  { kind: 'hero', titleKey: 'promo.shot.hero', noteKey: 'promo.shot.heroNote' },
  { kind: 'lifestyle', titleKey: 'promo.shot.lifestyle', noteKey: 'promo.shot.lifestyleNote' },
  { kind: 'macro', titleKey: 'promo.shot.macro', noteKey: 'promo.shot.macroNote' },
  { kind: 'package', titleKey: 'promo.shot.package', noteKey: 'promo.shot.packageNote' },
]

/** Один готовый кадр: data:URI картинки, пришедшей от Gemini. */
export interface PromoImage {
  readonly kind: PromoShotKind
  readonly dataUrl: string
}

export type PromoError = 'invalid' | 'failed'

/**
 * mock: true означает «ключа нет, рисуем локальные заглушки на клиенте».
 * Картинок в этом случае не приходит вовсе: сцены-заглушки собираются из
 * нашего же SVG доски и не имеют смысла в виде байтов на проводе.
 */
export type PromoResult =
  | { readonly ok: true; readonly mock: true; readonly kinds: readonly PromoShotKind[] }
  | { readonly ok: true; readonly mock: false; readonly images: readonly PromoImage[] }
  | { readonly ok: false; readonly error: PromoError }

/** Товар мерча: силуэт рисуем сами, id продукта нужен Printful. */
export type MerchProductId = 'tshirt' | 'mug' | 'poster' | 'apron'

export interface MerchProduct {
  readonly id: MerchProductId
  readonly titleKey: MessageKey
  /** id каталога Printful: 71 футболка Bella+Canvas 3001, 19 кружка, 1 постер, 186 фартук. */
  readonly printfulProductId: number
}

export const MERCH_PRODUCTS: readonly MerchProduct[] = [
  { id: 'tshirt', titleKey: 'merch.tshirt', printfulProductId: 71 },
  { id: 'mug', titleKey: 'merch.mug', printfulProductId: 19 },
  { id: 'poster', titleKey: 'merch.poster', printfulProductId: 1 },
  { id: 'apron', titleKey: 'merch.apron', printfulProductId: 186 },
]

export interface MerchMockup {
  readonly id: MerchProductId
  readonly url: string
}

export type MerchError = 'invalid' | 'failed'

/**
 * source: 'local' - показываем собственные SVG-мокапы на силуэтах.
 * printful: true - ключ есть, значит кнопка «Открыть в Printful» имеет смысл.
 */
export type MerchResult =
  | { readonly ok: true; readonly source: 'local'; readonly printful: boolean }
  | { readonly ok: true; readonly source: 'printful'; readonly mockups: readonly MerchMockup[] }
  | { readonly ok: false; readonly error: MerchError }

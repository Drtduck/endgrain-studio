import type { ProviderId } from '@/lib/ai/providers/types'
import type { AiDenyReason } from '@/lib/ai/quota'
import type { MessageKey } from '@/lib/i18n'

/**
 * Сценарии съёмки продуктовой серии. Двенадцать штук вместо прежних четырёх:
 * карточку товара на маркетплейсе одним ракурсом не закрыть, а вкусы у мастеров
 * разные - кому-то нужен каталожный чёрно-белый кадр, кому-то доска в руках.
 * Генерируются не все сразу: каждый кадр стоит единицу квоты, поэтому набор
 * выбирает пользователь.
 */
export type PromoShotKind =
  | 'hero'
  | 'studioDark'
  | 'hands'
  | 'serving'
  | 'macroOil'
  | 'workbench'
  | 'package'
  | 'stack'
  | 'island'
  | 'edge'
  | 'flatlay'
  | 'catalog'

/**
 * Компоновка заглушки. Двенадцать самодельных SVG-сцен рисовать незачем: у
 * заглушки одна задача - показать, как ляжет узор, поэтому кадры сведены к
 * четырём типовым раскладкам.
 */
export type PromoMockLayout = 'solo' | 'scene' | 'macro' | 'package'

export interface PromoShotMeta {
  readonly kind: PromoShotKind
  readonly titleKey: MessageKey
  readonly noteKey: MessageKey
  readonly mock: PromoMockLayout
}

export const PROMO_SHOT_META: readonly PromoShotMeta[] = [
  { kind: 'hero', titleKey: 'promo.shot.hero', noteKey: 'promo.shot.heroNote', mock: 'solo' },
  { kind: 'studioDark', titleKey: 'promo.shot.studioDark', noteKey: 'promo.shot.studioDarkNote', mock: 'solo' },
  { kind: 'hands', titleKey: 'promo.shot.hands', noteKey: 'promo.shot.handsNote', mock: 'solo' },
  { kind: 'serving', titleKey: 'promo.shot.serving', noteKey: 'promo.shot.servingNote', mock: 'scene' },
  { kind: 'macroOil', titleKey: 'promo.shot.macroOil', noteKey: 'promo.shot.macroOilNote', mock: 'macro' },
  { kind: 'workbench', titleKey: 'promo.shot.workbench', noteKey: 'promo.shot.workbenchNote', mock: 'scene' },
  { kind: 'package', titleKey: 'promo.shot.package', noteKey: 'promo.shot.packageNote', mock: 'package' },
  { kind: 'stack', titleKey: 'promo.shot.stack', noteKey: 'promo.shot.stackNote', mock: 'solo' },
  { kind: 'island', titleKey: 'promo.shot.island', noteKey: 'promo.shot.islandNote', mock: 'scene' },
  { kind: 'edge', titleKey: 'promo.shot.edge', noteKey: 'promo.shot.edgeNote', mock: 'macro' },
  { kind: 'flatlay', titleKey: 'promo.shot.flatlay', noteKey: 'promo.shot.flatlayNote', mock: 'scene' },
  { kind: 'catalog', titleKey: 'promo.shot.catalog', noteKey: 'promo.shot.catalogNote', mock: 'package' },
]

export const PROMO_SHOTS: readonly PromoShotKind[] = PROMO_SHOT_META.map((meta) => meta.kind)

export const PROMO_SHOT_LAYOUT: ReadonlyMap<PromoShotKind, PromoMockLayout> = new Map(
  PROMO_SHOT_META.map((meta) => [meta.kind, meta.mock]),
)

/**
 * Что отмечено при первом открытии вкладки: четыре кадра, которые закрывают
 * карточку товара сами по себе (витрина, кухня, макро, упаковка). Ровно те же
 * четыре, что серия рисовала до расширения набора, так что привычный сценарий
 * «нажал и получил» не изменился и стоит столько же.
 */
export const PROMO_DEFAULT_SHOTS: readonly PromoShotKind[] = ['hero', 'serving', 'macroOil', 'package']

/** Больше двенадцати кадров за раз не бывает: столько всего пресетов. */
export const PROMO_MAX_SHOTS = PROMO_SHOTS.length

/** Один готовый кадр: data:URI картинки, пришедшей от Gemini. */
export interface PromoImage {
  readonly kind: PromoShotKind
  readonly dataUrl: string
}

/**
 * Коды, а не готовые фразы: текст выбирает клиент по своей локали.
 * blocked это отказ модели по своим правилам (ответ 200 без картинки), он лечится
 * другим узором, а не повтором, поэтому от сетевого failed отделён намеренно.
 * tooLarge ловится ещё на клиенте, до отправки тела.
 */
export type PromoError = 'invalid' | 'failed' | 'blocked' | 'rateLimited' | 'tooLarge' | AiDenyReason

/**
 * mock: true означает «ключа нет, рисуем локальные заглушки на клиенте».
 * Картинок в этом случае не приходит вовсе: сцены-заглушки собираются из
 * нашего же SVG доски и не имеют смысла в виде байтов на проводе.
 */
export type PromoResult =
  | { readonly ok: true; readonly mock: true; readonly kinds: readonly PromoShotKind[] }
  | {
      readonly ok: true
      readonly mock: false
      readonly images: readonly PromoImage[]
      /** Остаток месячной квоты после этой серии: счётчик на вкладке обновляется без второго запроса. */
      readonly remaining?: number
      /** Кто нарисовал кадры: gemini, fal (fallback или пробный тир). Панель подписывает результат честно. */
      readonly provider?: ProviderId
    }
  | { readonly ok: false; readonly error: PromoError }

/** Товар мерча. Координаты в каталоге Printful лежат в printfulCatalog.ts. */
export type MerchProductId = 'tshirt' | 'mug' | 'poster' | 'apron'

export interface MerchProduct {
  readonly id: MerchProductId
  readonly titleKey: MessageKey
}

export const MERCH_PRODUCTS: readonly MerchProduct[] = [
  { id: 'tshirt', titleKey: 'merch.tshirt' },
  { id: 'mug', titleKey: 'merch.mug' },
  { id: 'poster', titleKey: 'merch.poster' },
  { id: 'apron', titleKey: 'merch.apron' },
]

export const MERCH_PRODUCT_IDS: readonly MerchProductId[] = MERCH_PRODUCTS.map((p) => p.id)

/**
 * Что отмечено при первом открытии. Ровно два товара, и это не вкусовщина:
 * генератор мокапов Printful пускает два create-task в минуту (замерено на
 * живом ключе), а четыре разом гарантированно упрутся в 429 на половине.
 * Остальные товары остаются локальной компоновкой, пока их не отметят.
 */
export const MERCH_DEFAULT_PRODUCTS: readonly MerchProductId[] = ['tshirt', 'mug']

/** Готовый мокап от Printful: ссылка на их CDN, срок жизни на их стороне. */
export interface MerchMockup {
  readonly id: MerchProductId
  readonly url: string
}

/**
 * Почему мокапы не приехали. notConfigured это «ключа Printful нет» и
 * «магазин не задан»: обе беды лечит владелец в окружении, а не пользователь.
 * rejected - Printful не принял макет, timeout - не успел отрисовать.
 */
export type MerchError =
  | 'invalid'
  | 'rateLimited'
  | 'notConfigured'
  | 'storage'
  | 'rejected'
  /** Printful упёрся в свой лимит: пара мокапов в минуту, остальные чуть позже. */
  | 'busy'
  | 'timeout'
  | 'failed'

/**
 * Итог сборки мерча. Силуэты в браузере рисуются всегда и остаются на месте,
 * если Printful недоступен: вкладка не имеет права опустеть из-за чужого сбоя.
 */
export interface MerchResult {
  /** Настроен ли Printful: от этого зависит кнопка «Открыть в Printful». */
  readonly printful: boolean
  /** Настоящие мокапы. Пусто значит, что показываем локальные силуэты. */
  readonly mockups?: readonly MerchMockup[]
  /** Заполнено, когда настоящие мокапы не вышли: панель объясняет причину. */
  readonly error?: MerchError
  /** Заполнено, когда сервер отказал: мокапы входят в Pro, и причина отказа нужна тексту в панели. */
  readonly denied?: AiDenyReason
}

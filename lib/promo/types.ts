import type { AiDenyReason } from '@/lib/ai/quota'
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
    }
  | { readonly ok: false; readonly error: PromoError }

/** Товар мерча: силуэт рисуем сами, id продукта пригодится будущему флоу Printful. */
export type MerchProductId = 'tshirt' | 'mug' | 'poster' | 'apron'

export interface MerchProduct {
  readonly id: MerchProductId
  readonly titleKey: MessageKey
  /**
   * id каталога Printful: 71 футболка Bella+Canvas 3001, 19 кружка, 1 постер, 186 фартук.
   * Сейчас не используется: генерация мокапов на стороне Printful отложена, см. MerchResult.
   */
  readonly printfulProductId: number
}

export const MERCH_PRODUCTS: readonly MerchProduct[] = [
  { id: 'tshirt', titleKey: 'merch.tshirt', printfulProductId: 71 },
  { id: 'mug', titleKey: 'merch.mug', printfulProductId: 19 },
  { id: 'poster', titleKey: 'merch.poster', printfulProductId: 1 },
  { id: 'apron', titleKey: 'merch.apron', printfulProductId: 186 },
]

/**
 * Мокапы мерча рисуются локально всегда, и это единственное, что действие сообщает:
 * есть ли ключ Printful, то есть имеет ли смысл кнопка «Открыть в Printful».
 *
 * Полный флоу Mockup Generator сюда сознательно не заведён: он требует публичного
 * https-адреса макета (Printful тянет файл со своей стороны, data:URI не примет),
 * создания задачи с variant_ids и format, а затем поллинга task_key до готовности.
 * Ни хостинга макета, ни очереди у нас пока нет, поэтому этап отложен, и писать
 * заведомо нерабочую ветку в код смысла нет.
 */
export interface MerchResult {
  readonly printful: boolean
  /** Заполнено, когда сервер отказал: мокапы входят в Pro, и причина отказа нужна тексту в панели. */
  readonly denied?: AiDenyReason
}

import type { Locale, MessageKey } from '@/lib/i18n'

/**
 * Требования площадок к фото карточки и к тексту листинга. Собрано веб-поиском
 * 14.08.2026 (спека, раздел 7.0-7.2). Качество подтверждения РАЗНОЕ:
 *
 *   - Яндекс.Маркет - подтверждено первоисточником, страница считана напрямую
 *     (https://yandex.ru/support/marketplace/ru/assortment/create/main-fields/images).
 *   - Amazon, eBay, Etsy, Wildberries, Mercado Libre, Ozon - официальные страницы
 *     либо за логином, либо отдали таймаут/редирект-луп при попытке считать напрямую.
 *     Цифры сходятся у нескольких независимых источников того же домена (или, для
 *     Wildberries, у нескольких независимых селлер-сервисов), но НЕ проверены
 *     напрямую документацией площадки.
 *
 * confirmed: false значит именно это: «первоисточник не считан напрямую, цифры
 * сходятся у независимых источников». Это не повод не пользоваться справочником,
 * это повод не врать пользователю про гарантию - в UI такая площадка несёт сноску
 * «сверьтесь с кабинетом продавца».
 *
 * targetAspect (image.aspect) - это аспект ВИТРИНЫ, а не минимального требования
 * площадки: Ozon принимает квадрат для нашей категории, но в выдаче показывает 3:4,
 * и квадрат там обрежется по бокам. Продаёт то, что видно в выдаче, поэтому для
 * Ozon и Wildberries аспект пака - 3:4, а не 1:1.
 */

export type MarketplaceId = 'amazon' | 'ebay' | 'etsy' | 'wildberries' | 'mercadolibre' | 'ozon' | 'yandexmarket'

/** ru площадки видны только при русском интерфейсе, global - всегда. */
export type MarketplaceLocaleScope = 'global' | 'ru'

export interface MarketplaceImageSpec {
  /** Целевой аспект пака: [w, h]. Аспект ВИТРИНЫ, см. комментарий выше. */
  readonly aspect: readonly [number, number]
  /** Целевой размер пака в пикселях. */
  readonly target: { readonly width: number; readonly height: number }
  readonly minWidth: number
  readonly minHeight: number
  readonly maxLongSide: number | null
  readonly maxBytes: number
  readonly format: 'jpeg' | 'png'
  /** Чем добивать поля, если исходный аспект не совпал с целевым. null значит «кропать, не добивать». */
  readonly padColor: string | null
  readonly maxImages: number
}

export interface MarketplaceListingRules {
  readonly titleMax: number
  readonly descriptionMax: number
  readonly bulletCount: number
  readonly bulletMax: number
  readonly tagCount: number
  readonly tagMax: number
  /** Разрешена ли HTML-разметка в описании. */
  readonly htmlDescription: boolean
}

export interface MarketplaceSpec {
  readonly id: MarketplaceId
  readonly labelKey: MessageKey
  readonly scope: MarketplaceLocaleScope
  readonly image: MarketplaceImageSpec
  readonly listing: MarketplaceListingRules
  readonly sourceUrl: string
  readonly confirmed: boolean
}

export const MARKETPLACES: readonly MarketplaceSpec[] = [
  {
    id: 'amazon',
    labelKey: 'market.amazon',
    scope: 'global',
    image: {
      aspect: [1, 1],
      // 2000 px, а не 1000: порог зума у Amazon начинается с 1000 px по длинной
      // стороне, и кадр ровно на пороге может не включить зум. Берём с запасом.
      target: { width: 2000, height: 2000 },
      minWidth: 1000, minHeight: 1000, maxLongSide: null,
      maxBytes: 10 * 1024 * 1024, format: 'jpeg',
      // Amazon требует именно чистый белый RGB 255,255,255 на главном фото.
      padColor: '#FFFFFF',
      maxImages: 9,
    },
    listing: { titleMax: 200, descriptionMax: 2000, bulletCount: 5, bulletMax: 500, tagCount: 7, tagMax: 50, htmlDescription: false },
    sourceUrl: 'https://sellercentral.amazon.com/help/hub/reference/external/G1881',
    confirmed: false,
  },
  {
    id: 'ebay',
    labelKey: 'market.ebay',
    scope: 'global',
    image: {
      aspect: [1, 1],
      target: { width: 1600, height: 1600 },
      minWidth: 500, minHeight: 500, maxLongSide: null,
      maxBytes: 12 * 1024 * 1024, format: 'jpeg',
      padColor: '#FFFFFF',
      maxImages: 24,
    },
    listing: { titleMax: 80, descriptionMax: 500_000, bulletCount: 5, bulletMax: 200, tagCount: 0, tagMax: 0, htmlDescription: true },
    sourceUrl: 'https://developer.ebay.com/support/kb-article?KBid=1004',
    confirmed: false,
  },
  {
    id: 'etsy',
    labelKey: 'market.etsy',
    scope: 'global',
    image: {
      // Оставлено из существующей карточки товара (lib/promo/listing.ts): цифры
      // не проверялись в этом проходе веб-поиска, поэтому тоже confirmed: false.
      aspect: [4, 3],
      target: { width: 2000, height: 1500 },
      minWidth: 1000, minHeight: 750, maxLongSide: null,
      maxBytes: 20 * 1024 * 1024, format: 'jpeg',
      padColor: null,
      maxImages: 10,
    },
    listing: { titleMax: 140, descriptionMax: 5000, bulletCount: 0, bulletMax: 0, tagCount: 13, tagMax: 20, htmlDescription: false },
    sourceUrl: 'https://help.etsy.com/hc/en-us/articles/360000579548',
    confirmed: false,
  },
  {
    id: 'wildberries',
    labelKey: 'market.wildberries',
    scope: 'ru',
    image: {
      // Витрина WB режет квадрат в 3:4 не хуже Ozon: аспект пака под витрину.
      aspect: [3, 4],
      target: { width: 1200, height: 1600 },
      minWidth: 700, minHeight: 900, maxLongSide: 8000,
      maxBytes: 10 * 1024 * 1024, format: 'jpeg',
      padColor: '#FFFFFF',
      maxImages: 30,
    },
    // Не подтверждено официальным источником, консервативная оценка (спека 8.4):
    // публичной документации без логина продавца у WB нет вовсе.
    listing: { titleMax: 60, descriptionMax: 5000, bulletCount: 0, bulletMax: 0, tagCount: 20, tagMax: 30, htmlDescription: false },
    sourceUrl: 'https://seller.wildberries.ru/',
    // Публичной документации без логина не существует: цифры агрегированы из
    // независимых селлер-сервисов (SellerMoon, TrustyOne, Avriro), которые
    // совпадают между собой, но не подтверждены первоисточником.
    confirmed: false,
  },
  {
    id: 'mercadolibre',
    labelKey: 'market.mercadolibre',
    scope: 'global',
    image: {
      aspect: [1, 1],
      target: { width: 1200, height: 1200 },
      minWidth: 500, minHeight: 500, maxLongSide: null,
      maxBytes: 10 * 1024 * 1024, format: 'jpeg',
      padColor: '#FFFFFF',
      maxImages: 12,
    },
    // Не подтверждено официальным источником, консервативная оценка: требования
    // на vendedores.mercadolibre.com категорийные, а не единые.
    listing: { titleMax: 60, descriptionMax: 50_000, bulletCount: 0, bulletMax: 0, tagCount: 0, tagMax: 0, htmlDescription: false },
    sourceUrl: 'https://vendedores.mercadolibre.com/nota/requisitos-de-fotos-para-vender',
    confirmed: false,
  },
  {
    id: 'ozon',
    labelKey: 'market.ozon',
    scope: 'ru',
    image: {
      // Ozon принимает 1:1 для нашей категории (товары общего назначения), но
      // выдачу рисует в 3:4 - целевой аспект пака берём под витрину.
      aspect: [3, 4],
      target: { width: 1200, height: 1600 },
      minWidth: 700, minHeight: 900, maxLongSide: 7680,
      maxBytes: 10 * 1024 * 1024, format: 'jpeg',
      padColor: '#FFFFFF',
      maxImages: 30,
    },
    listing: { titleMax: 200, descriptionMax: 6000, bulletCount: 0, bulletMax: 0, tagCount: 0, tagMax: 0, htmlDescription: true },
    sourceUrl: 'https://docs.ozon.ru/global/products/upload/adding-content/image-requirements',
    confirmed: false,
  },
  {
    id: 'yandexmarket',
    labelKey: 'market.yandexmarket',
    scope: 'ru',
    image: {
      aspect: [3, 4],
      target: { width: 1200, height: 1600 },
      minWidth: 300, minHeight: 300, maxLongSide: 8000,
      maxBytes: 10 * 1024 * 1024, format: 'jpeg',
      // Товар обязан занимать не менее 2/3 кадра: поля не более 1/6 с каждой стороны.
      padColor: '#FFFFFF',
      maxImages: 30,
    },
    // Оффдок молчит про буллеты/теги для карточки: заведены нули и консервативный
    // titleMax/descriptionMax, что и отражено оговоркой ниже (спека 8.4).
    listing: { titleMax: 150, descriptionMax: 6000, bulletCount: 0, bulletMax: 0, tagCount: 0, tagMax: 0, htmlDescription: false },
    sourceUrl: 'https://yandex.ru/support/marketplace/ru/assortment/create/main-fields/images',
    confirmed: true,
  },
]

const MARKETPLACE_ID_LIST: readonly MarketplaceId[] = MARKETPLACES.map((m) => m.id)
export const MARKETPLACE_IDS = MARKETPLACE_ID_LIST as readonly [MarketplaceId, ...MarketplaceId[]]

const MARKETPLACE_BY_ID: ReadonlyMap<MarketplaceId, MarketplaceSpec> = new Map(MARKETPLACES.map((m) => [m.id, m]))

export function marketplaceById(id: MarketplaceId): MarketplaceSpec {
  const spec = MARKETPLACE_BY_ID.get(id)
  if (spec === undefined) throw new Error(`unknown marketplace: ${id}`)
  return spec
}

/**
 * Что показывать в селекторе. Русские площадки видны только при русском
 * интерфейсе: американскому столяру Ozon в списке не нужен, а длинный список
 * из семи пунктов, половина которых бессмысленна, это шум (спека, раздел 7.2).
 */
export function marketplacesFor(locale: Locale): readonly MarketplaceSpec[] {
  return locale === 'ru' ? MARKETPLACES : MARKETPLACES.filter((m) => m.scope === 'global')
}

export const DEFAULT_MARKETPLACE: MarketplaceId = 'amazon'

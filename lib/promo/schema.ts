// Вынесено из app/actions/promo.ts: файл с директивой 'use server' может
// экспортировать только асинхронные функции, ни схему, ни константу оттуда Next не соберёт.
import { z } from 'zod'
import { STYLE_FIELDS, STYLE_FIELD_MAX } from './reference'
import { MERCH_PRODUCT_IDS, PROMO_MAX_SHOTS, PROMO_SHOTS, type MerchProductId, type PromoShotKind } from './types'

/**
 * Рендер доски приходит с клиента готовым PNG: серверу нечем растеризовать SVG.
 * Проверяем не только префикс data-url, но и магию файла: base64 настоящего PNG
 * всегда начинается с iVBORw0KGgo (сигнатура 89 50 4E 47 0D 0A 1A 0A).
 */
export const PNG_DATA_URL_RE = /^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/=]*$/

/**
 * Потолок тела серверного действия в Next по умолчанию 1 МБ и поднят до 5 МБ в next.config.
 * 3.5 млн символов base64 это около 2.6 МБ картинки: с запасом влезает вместе с промптом,
 * а рендер доски в 1024 px столько никогда и не весит.
 */
export const MAX_PNG_CHARS = 3_500_000

/** Набор пресетов кадра. Пустой набор бессмыслен, повторы схлопываем на сервере. */
const shotKinds = z
  .array(z.enum(PROMO_SHOTS as readonly [PromoShotKind, ...PromoShotKind[]]))
  .min(1)
  .max(PROMO_MAX_SHOTS)

export const promoShotsSchema = z.object({
  boardPng: z.string().max(MAX_PNG_CHARS).regex(PNG_DATA_URL_RE),
  description: z.string().trim().min(1).max(2000),
  kinds: shotKinds,
})

export type PromoShotsInput = z.infer<typeof promoShotsSchema>

/**
 * Референс приходит от человека, а не из нашего же рендера, поэтому проверок
 * больше: тип, магия файла и размер. Три формата, все растровые. SVG нет
 * намеренно, как и во вложениях фидбека: он исполняет скрипты при открытии.
 */
export const REFERENCE_MIME: readonly string[] = ['image/png', 'image/jpeg', 'image/webp']

/** Атрибут accept для input[type=file], синхронный с белым списком. */
export const REFERENCE_ACCEPT = REFERENCE_MIME.join(',')

/** 4 МБ бинаря это примерно 5.5M символов base64, что уже не влезает в bodySizeLimit. */
export const REFERENCE_MAX_BYTES = 3 * 1024 * 1024

/** base64 раздувает бинарь примерно в 1.37 раза плюс заголовок data-url. */
export const REFERENCE_MAX_CHARS = 4_200_000

/**
 * Магия файла по типу. Верить полю mime из браузера нельзя: картинка уезжает
 * в модель и цитируется в ответе, а подменённый тип это способ протащить не то,
 * что заявлено. base64 первых байтов совпадает у любого файла того же формата.
 */
export const REFERENCE_DATA_URL_RE = new RegExp(
  '^data:image/(?:' +
    [
      // PNG: 89 50 4E 47 0D 0A 1A 0A
      'png;base64,iVBORw0KGgo',
      // JPEG: FF D8 FF
      'jpeg;base64,/9j/',
      // WEBP: RIFF....WEBP
      'webp;base64,UklGR',
    ].join('|') +
    ')[A-Za-z0-9+/=]*$',
)

export const referenceAnalyzeSchema = z.object({
  referenceImage: z.string().max(REFERENCE_MAX_CHARS).regex(REFERENCE_DATA_URL_RE),
})

const styleSchema = z.object(
  Object.fromEntries(STYLE_FIELDS.map((field) => [field, z.string().trim().max(STYLE_FIELD_MAX)])) as Record<
    (typeof STYLE_FIELDS)[number],
    z.ZodString
  >,
)

/** Сколько кадров по референсу разрешено за раз. Больше четырёх ракурсов у нас и нет. */
export const REFERENCE_MAX_COUNT = 4

export const referenceShotsSchema = z.object({
  boardPng: z.string().max(MAX_PNG_CHARS).regex(PNG_DATA_URL_RE),
  description: z.string().trim().min(1).max(2000),
  style: styleSchema,
  count: z.number().int().min(1).max(REFERENCE_MAX_COUNT),
})

export type ReferenceShotsInput = z.infer<typeof referenceShotsSchema>

/**
 * Макет мерча: тот же рендер доски, что и в серии фото, плюс набор товаров.
 * Товары выбираются, а не берутся все четыре: генератор мокапов Printful пускает
 * пару запросов в минуту, и «собрать всё разом» упирается в его 429.
 */
export const merchSchema = z.object({
  boardPng: z.string().max(MAX_PNG_CHARS).regex(PNG_DATA_URL_RE),
  products: z
    .array(z.enum(MERCH_PRODUCT_IDS as readonly [MerchProductId, ...MerchProductId[]]))
    .min(1)
    .max(MERCH_PRODUCT_IDS.length),
})

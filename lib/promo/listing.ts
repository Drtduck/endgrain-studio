import { z } from 'zod'
import { mmToInch } from '@/lib/units'
import type { BoardDescription } from './describe'

/**
 * Карточка товара для Amazon и Etsy. Text-only генерация через тот же пайплайн,
 * что уже стоит в реализации разбора референса (модель gemini-2.5-flash,
 * эндпойнт generateContent, responseSchema для строгого JSON). Файл чистый:
 * ни сети, ни server-only, промпт и разбор ответа тестируются напрямую.
 */

/** Потолок Etsy: 13 тегов, каждый до 20 символов. */
export const ETSY_TAG_COUNT = 13
export const ETSY_TAG_MAX = 20

/** Потолок Amazon: ровно пять буллетов. */
export const AMAZON_BULLET_COUNT = 5
export const BULLET_MAX = 200

export const TITLE_MAX = 140
export const DESCRIPTION_MAX = 2000
export const MATERIALS_MAX_LINES = 5
export const CARE_MAX = 600

export interface SaleListing {
  readonly title: string
  readonly bullets: readonly string[]
  readonly keywords: readonly string[]
  readonly description: string
  readonly materials: readonly string[]
  readonly care: string
}

const listingSchema = z.object({
  title: z.string().trim().min(1).max(TITLE_MAX),
  bullets: z.array(z.string().trim().min(1).max(BULLET_MAX)).length(AMAZON_BULLET_COUNT),
  keywords: z.array(z.string().trim().min(1).max(ETSY_TAG_MAX)).length(ETSY_TAG_COUNT),
  description: z.string().trim().min(1).max(DESCRIPTION_MAX),
  materials: z.array(z.string().trim().min(1)).min(1).max(MATERIALS_MAX_LINES),
  care: z.string().trim().min(1).max(CARE_MAX),
})

/** JSON-схема ответа для responseSchema Gemini: без неё модель иногда заворачивает JSON в прозу. */
export const LISTING_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    bullets: { type: 'array', items: { type: 'string' }, minItems: AMAZON_BULLET_COUNT, maxItems: AMAZON_BULLET_COUNT },
    keywords: { type: 'array', items: { type: 'string' }, minItems: ETSY_TAG_COUNT, maxItems: ETSY_TAG_COUNT },
    description: { type: 'string' },
    materials: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: MATERIALS_MAX_LINES },
    care: { type: 'string' },
  },
  required: ['title', 'bullets', 'keywords', 'description', 'materials', 'care'],
  propertyOrdering: ['title', 'bullets', 'keywords', 'description', 'materials', 'care'],
} as const

/** Дюймовое представление габарита: обязательный формат для карточки Amazon и Etsy. */
export function boardSizeInches(widthMm: number, lengthMm: number, thicknessMm: number): string {
  const w = mmToInch(widthMm).toFixed(1)
  const l = mmToInch(lengthMm).toFixed(1)
  const th = mmToInch(thicknessMm).toFixed(2)
  return `${w} x ${l} x ${th} in`
}

/**
 * Разбор ответа модели. Модель отвечает текстом, даже когда её просили про JSON,
 * поэтому: пробуем разобрать целиком, а если не вышло - вырезаем первый объект
 * из строки. Урезанный или неполный ответ (не ровно 13 тегов, не ровно 5 буллетов,
 * тег длиннее 20 символов) отбивается схемой и возвращает null, а не догадку.
 */
export function parseListing(text: string): SaleListing | null {
  const candidates = [text]
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) candidates.push(text.slice(start, end + 1))

  for (const candidate of candidates) {
    let raw: unknown
    try {
      raw = JSON.parse(candidate)
    } catch {
      continue
    }
    const parsed = listingSchema.safeParse(raw)
    if (parsed.success) return parsed.data
  }
  return null
}

/**
 * Демо-карточка без единого запроса наружу: ключа Gemini нет, значит платить не
 * за что, и вкладка «Промо» рисует детерминированную карточку из реальных чисел
 * проекта. Ровно как demoListing из спеки: собирается чистой функцией, без сети.
 */
export function demoListing(description: BoardDescription, sizeIn: string): SaleListing {
  const primaryWood = description.species[0] ?? 'hardwood'
  const woods = description.species.length > 0 ? description.species.join(' & ') : 'hardwood'
  const title = `${capitalize(primaryWood)} End-Grain Cutting Board, ${description.sizeMm} Handmade Wood Chopping Block`.slice(
    0,
    TITLE_MAX,
  )

  const bullets = [
    `Handmade end-grain board: ${description.sizeMm} (${sizeIn}), built to last for years of daily use.`,
    `Blade-friendly surface: end-grain construction is gentler on knife edges than a face-grain board.`,
    `Real hardwood: made from ${woods}, each board unique in grain and color.`,
    `Food-safe finish: oiled to a satin sheen, ready to use out of the box.`,
    `Thoughtful gift: a lasting kitchen piece for weddings, housewarmings and holidays.`,
  ].map((line) => line.slice(0, BULLET_MAX))

  const keywordPool = [
    'cutting board',
    'end grain board',
    'wood chopping block',
    'handmade cutting board',
    'kitchen gift',
    'housewarming gift',
    'wedding gift',
    primaryWood.toLowerCase(),
    'charcuterie board',
    'butcher block',
    'wooden board',
    'chef gift',
    'made in usa',
  ]
  const keywords = keywordPool.slice(0, ETSY_TAG_COUNT).map((word) => word.slice(0, ETSY_TAG_MAX))

  const description_ = (
    `A handmade end-grain cutting board, ${description.sizeMm} (${sizeIn}), made of ${woods}. ` +
    `The end-grain face shows a ${description.cellCount}-block geometric pattern, oiled to a satin finish. ` +
    `End-grain construction lets the knife slip between the wood fibres instead of cutting across them, ` +
    `so the board stays kinder to your blades and heals its own small marks over time.`
  ).slice(0, DESCRIPTION_MAX)

  const materials = description.species.slice(0, MATERIALS_MAX_LINES > 0 ? MATERIALS_MAX_LINES - 1 : 0)
  materials.push('Food-safe mineral oil finish')

  const care = (
    'Hand wash only, no soaking and no dishwasher. Dry standing up right after washing. ' +
    'Rub in food-safe mineral oil once a month, more often if the surface looks dry or pale. ' +
    'Keep away from direct heat and prolonged sun.'
  ).slice(0, CARE_MAX)

  return {
    title,
    bullets,
    keywords,
    description: description_,
    materials: materials.slice(0, MATERIALS_MAX_LINES),
    care,
  }
}

function capitalize(word: string): string {
  return word.length === 0 ? word : word[0]!.toUpperCase() + word.slice(1)
}

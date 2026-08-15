import { z } from 'zod'
import type { BoardDescription } from './describe'
import { demoListing } from './listing'
import type { MarketplaceSpec } from './marketplaces'

/**
 * Карточка товара под конкретную площадку (спека, раздел 8). В отличие от
 * lib/promo/listing.ts (единая карточка Amazon+Etsy с фиксированной формой -
 * ровно 5 буллетов, ровно 13 тегов), тут форма гибкая: лимиты идут из
 * MarketplaceListingRules и у части площадок (Ozon, Wildberries, Яндекс.Маркет)
 * буллетов или тегов нет вовсе (bulletCount/tagCount = 0).
 */
export interface PromoListingDraft {
  readonly title: string
  readonly description: string
  readonly bullets: readonly string[]
  readonly tags: readonly string[]
}

/**
 * Обрезка по последнему пробелу в пределах лимита, а не посимвольно: иначе
 * тег обрывается на середине слова ('handmade cutting boa' вместо
 * 'handmade cutting'). Если слово одно и само длиннее лимита - пробела внутри
 * лимита нет, откатываемся на обычную посимвольную обрезку.
 */
function truncateAtWordBoundary(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  const cut = text.slice(0, maxLen)
  const lastSpace = cut.lastIndexOf(' ')
  return lastSpace > 0 ? cut.slice(0, lastSpace) : cut
}

/** count <= 0 значит «площадка это поле не использует» - обрезаем до пустого массива, не до «сколько дали». */
function clampList(
  items: readonly string[],
  count: number,
  maxLen: number,
  truncate: (item: string, maxLen: number) => string = (item, m) => item.slice(0, m),
): readonly string[] {
  if (count <= 0) return []
  return items.slice(0, count).map((item) => truncate(item, maxLen))
}

/**
 * Демо-карточка без единого запроса наружу: собирается из demoListing (та же
 * честная функция от реальных чисел проекта, что и в generic-карточке), просто
 * обрезанная под лимиты выбранной площадки - переиспользование, а не второй
 * генератор тех же чисел.
 */
export function demoListingForMarketplace(description: BoardDescription, sizeIn: string, spec: MarketplaceSpec): PromoListingDraft {
  const base = demoListing(description, sizeIn)
  const rules = spec.listing
  return {
    title: base.title.slice(0, rules.titleMax),
    description: base.description.slice(0, rules.descriptionMax),
    bullets: clampList(base.bullets, rules.bulletCount, rules.bulletMax),
    tags: clampList(base.keywords, rules.tagCount, rules.tagMax, truncateAtWordBoundary),
  }
}

/**
 * Промпт под конкретную площадку. sceneNotes - короткие описания отмеченных
 * кадров ("hero shot on white", "macro of the end grain"): текст пишется под
 * то, что человек реально покажет на фото (спека 8.2, "Кадры -> текст").
 */
export function marketplaceListingPrompt(
  description: BoardDescription,
  sizeIn: string,
  spec: MarketplaceSpec,
  sceneNotes: readonly string[],
): string {
  const rules = spec.listing
  const lines = [
    'You are an e-commerce copywriter for a woodworking shop selling handmade end-grain cutting boards.',
    `Write a marketplace listing for ${spec.id}, matching its field limits exactly.`,
    '',
    `Board: ${description.text}`,
    `Size (metric): ${description.sizeMm}`,
    `Size (imperial): ${sizeIn}`,
  ]
  if (sceneNotes.length > 0) lines.push(`Photos that will accompany this listing show: ${sceneNotes.join('; ')}.`)
  lines.push(
    '',
    'Answer with JSON only, using exactly these keys:',
    `- title: a product title, up to ${rules.titleMax} characters, keyword-rich, no ALL CAPS, no emoji`,
    `- description: the full listing description, up to ${rules.descriptionMax} characters${
      rules.htmlDescription ? ' (simple HTML allowed: <p>, <ul>, <li>, <b>)' : ' (plain text, no markup)'
    }`,
    rules.bulletCount > 0
      ? `- bullets: exactly ${rules.bulletCount} short feature bullets, each up to ${rules.bulletMax} characters`
      : '- bullets: an empty array, this marketplace has no bullet field',
    rules.tagCount > 0
      ? `- tags: exactly ${rules.tagCount} lowercase search tags, each up to ${rules.tagMax} characters, no duplicates, no hashtags`
      : '- tags: an empty array, this marketplace has no tag field',
  )
  return lines.join('\n')
}

const looseListingSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  bullets: z.array(z.string().trim().min(1)).max(30).optional(),
  tags: z.array(z.string().trim().min(1)).max(60).optional(),
})

/**
 * Разбор ответа модели под лимиты площадки. Модель отвечает текстом, даже
 * когда просили строго JSON: пробуем разобрать целиком, а если не вышло -
 * вырезаем первый объект из строки (тот же приём, что и в lib/promo/listing.ts).
 * Схема разбора нарочно нестрогая по количеству элементов - реальное
 * обрезание/зануление буллетов и тегов делает clampList под правила площадки,
 * а не отбраковка целого ответа за «14 буллетов вместо 13».
 */
export function parseMarketplaceListing(text: string, spec: MarketplaceSpec): PromoListingDraft | null {
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
    const parsed = looseListingSchema.safeParse(raw)
    if (parsed.success) {
      const rules = spec.listing
      return {
        title: parsed.data.title.slice(0, rules.titleMax),
        description: parsed.data.description.slice(0, rules.descriptionMax),
        bullets: clampList(parsed.data.bullets ?? [], rules.bulletCount, rules.bulletMax),
        tags: clampList(parsed.data.tags ?? [], rules.tagCount, rules.tagMax, truncateAtWordBoundary),
      }
    }
  }
  return null
}

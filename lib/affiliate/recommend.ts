import type { CalcResult } from '@/lib/calc'
import { isStrip, type BoardModel, type Design } from '@/lib/engine'
import { PRODUCTS } from './index'
import type { AffiliateItem } from './types'

/**
 * Почему товар попал в подборку. Ключ строки в lib/i18n всегда `recommend.reason.<reason>`,
 * ровно как у диагностик: человек должен видеть причину, а не безликую витрину.
 */
export type RecommendReason = 'glueup' | 'wide' | 'wideGlue' | 'crosscuts' | 'precision' | 'finish' | 'ready'

export interface Recommendation {
  readonly item: AffiliateItem
  readonly reason: RecommendReason
}

export interface RecommendInput {
  readonly design: Design
  readonly model: BoardModel
  readonly calc: CalcResult
}

/** Больше восьми карточек в узкой колонке превращаются в каталог, а не в совет. */
export const MAX_RECOMMENDATIONS = 8

/** Широкий щит: столько поперечных резов уже просит точного упора, а не глазомера. */
export const MANY_CROSSCUTS = 20
/** С этой ширины корпусных струбцин перестаёт хватать и дешевле уходить в трубные. */
export const WIDE_GLUEUP_MM = 400
/** Столько полос в первой склейке уже не выставить на глаз. */
export const MANY_STRIPS = 12

const PRODUCT_BY_ID: ReadonlyMap<string, AffiliateItem> = new Map(PRODUCTS.map((item) => [item.id, item]))

interface Rule {
  readonly reason: RecommendReason
  readonly ids: readonly string[]
  readonly when: (input: RecommendInput) => boolean
}

function stripCount(design: Design): number {
  let count = 0
  for (const panel of design.panels) {
    for (const element of panel.elements) if (isStrip(element)) count += 1
  }
  return count
}

/**
 * Порядок правил и есть приоритет выдачи: сначала то, без чего склейка сегодня не поедет,
 * потом обработка, потом финиш. Товар, попавший под два правила, показывается один раз
 * с причиной первого сработавшего.
 */
const RULES: readonly Rule[] = [
  {
    reason: 'glueup',
    ids: ['glue-titebond3', 'clamps-bar-24', 'glue-brush'],
    when: ({ design }) => design.rows.length > 0,
  },
  {
    reason: 'wideGlue',
    ids: ['clamps-pipe'],
    when: ({ model }) => model.widthMm >= WIDE_GLUEUP_MM,
  },
  {
    reason: 'wide',
    ids: ['scraper-card', 'sandpaper-set'],
    when: ({ design, model }) => model.widthMm > design.planerWidthMm,
  },
  {
    reason: 'crosscuts',
    ids: ['sled-miter-gauge'],
    when: ({ model, calc }) => Math.max(model.cutCount, calc.cutCount) >= MANY_CROSSCUTS,
  },
  {
    reason: 'precision',
    ids: ['caliper-digital', 'square-combo'],
    when: ({ design }) => stripCount(design) >= MANY_STRIPS || design.species.length >= 3,
  },
  {
    reason: 'finish',
    ids: ['oil-mineral', 'wax-boardcream'],
    when: () => true,
  },
  {
    reason: 'ready',
    ids: ['feet-rubber'],
    when: () => true,
  },
]

/**
 * Чистая функция: те же параметры проекта дают ту же подборку, ни сети, ни DOM.
 * Неизвестный id в правиле молча пропускается: подборка не должна падать из-за
 * товара, который выпилили из products.json.
 */
export function recommendProducts(input: RecommendInput): readonly Recommendation[] {
  const out: Recommendation[] = []
  const seen = new Set<string>()
  for (const rule of RULES) {
    if (!rule.when(input)) continue
    for (const id of rule.ids) {
      if (seen.has(id)) continue
      const item = PRODUCT_BY_ID.get(id)
      if (item === undefined) continue
      seen.add(id)
      out.push({ item, reason: rule.reason })
      if (out.length >= MAX_RECOMMENDATIONS) return out
    }
  }
  return out
}

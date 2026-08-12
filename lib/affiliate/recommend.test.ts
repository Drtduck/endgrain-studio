import { describe, expect, it } from 'vitest'
import { calcProject } from '@/lib/calc'
import { compile, type Design } from '@/lib/engine'
import { makeCheckerboard } from '@/lib/designs/samples'
import { PRODUCTS } from './index'
import { MANY_CROSSCUTS, MAX_RECOMMENDATIONS, WIDE_GLUEUP_MM, recommendProducts, type RecommendInput } from './recommend'

function inputFrom(design: Design): RecommendInput {
  const model = compile(design)
  return { design, model, calc: calcProject(design, model) }
}

function ids(input: RecommendInput): readonly string[] {
  return recommendProducts(input).map((r) => r.item.id)
}

describe('recommendProducts', () => {
  const base = makeCheckerboard()

  it('масло и воск советуются всегда: финиш нужен любой доске', () => {
    expect(ids(inputFrom(base))).toEqual(expect.arrayContaining(['oil-mineral', 'wax-boardcream']))
  })

  it('при непустой склейке первыми идут клей и струбцины', () => {
    const list = recommendProducts(inputFrom(base))
    expect(list[0]?.item.id).toBe('glue-titebond3')
    expect(list[0]?.reason).toBe('glueup')
    expect(list.map((r) => r.item.id)).toContain('clamps-bar-24')
  })

  it('пустой список рядов убирает причину glueup, но финиш остаётся', () => {
    const list = ids(inputFrom({ ...base, rows: [] }))
    expect(list).not.toContain('glue-titebond3')
    expect(list).toContain('oil-mineral')
  })

  it('щит шире рейсмуса добавляет циклю и шлифовку', () => {
    const narrowPlaner = inputFrom({ ...base, planerWidthMm: 10 })
    expect(narrowPlaner.model.widthMm).toBeGreaterThan(10)
    const list = ids(narrowPlaner)
    expect(list).toContain('scraper-card')
    expect(list).toContain('sandpaper-set')
  })

  it('щит уже рейсмуса не тянет за собой шлифовку', () => {
    const wide = inputFrom({ ...base, planerWidthMm: 5000 })
    expect(ids(wide)).not.toContain('scraper-card')
  })

  it('широкая склейка добавляет трубные струбцины и это отдельная причина', () => {
    // Ширину модели даёт сумма полос панели, а не targetWidthMm: 20 клеток по 30 мм это 600 мм.
    const input = inputFrom(makeCheckerboard({ cols: 20 }))
    const hit = recommendProducts(input).find((r) => r.item.id === 'clamps-pipe')
    expect(input.model.widthMm).toBeGreaterThanOrEqual(WIDE_GLUEUP_MM)
    expect(hit?.reason).toBe('wideGlue')
  })

  it('много поперечных резов добавляет точный упор', () => {
    const input = inputFrom(base)
    const many: RecommendInput = { ...input, calc: { ...input.calc, cutCount: MANY_CROSSCUTS } }
    expect(ids(many)).toContain('sled-miter-gauge')
    const few: RecommendInput = {
      ...input,
      model: { ...input.model, cutCount: 0 },
      calc: { ...input.calc, cutCount: MANY_CROSSCUTS - 1 },
    }
    expect(ids(few)).not.toContain('sled-miter-gauge')
  })

  it('каждый товар встречается ровно один раз и список не длиннее лимита', () => {
    const list = ids(inputFrom({ ...base, planerWidthMm: 10 }))
    expect(new Set(list).size).toBe(list.length)
    expect(list.length).toBeLessThanOrEqual(MAX_RECOMMENDATIONS)
  })

  it('все id из правил существуют в products.json', () => {
    const known = new Set(PRODUCTS.map((p) => p.id))
    // Прогоняем через заведомо «богатый» проект, чтобы сработали все правила разом.
    const list = ids(inputFrom({ ...makeCheckerboard({ cols: 20 }), planerWidthMm: 10 }))
    expect(list.length).toBeGreaterThan(0)
    for (const id of list) expect(known.has(id)).toBe(true)
  })

  it('чистая функция: одинаковый вход даёт одинаковый выход', () => {
    const input = inputFrom(base)
    expect(ids(input)).toEqual(ids(input))
  })
})

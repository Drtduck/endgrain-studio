import { describe, expect, it } from 'vitest'
import { makeCheckerboard } from '@/lib/designs/samples'
import { panelLengthMm, panelWidthMm, rowBandsMm, slicesOfPanel, type Design } from '@/lib/engine'
import { t } from '@/lib/i18n'
import { buildCutPlan, buildGlueUpSteps } from './cutlist'

const design = makeCheckerboard()

/** Двухуровневый проект: панель P2 состоит из полос и одного среза панели P1. */
function inlayDesign(): Design {
  const base = makeCheckerboard()
  const inner = base.panels[0]
  expect(inner).toBeDefined()
  if (!inner) throw new Error('фикстура сломана')
  const outer = {
    id: 'PX',
    elements: [
      { kind: 'strip', speciesId: 'maple', widthMm: 40 } as const,
      { kind: 'sliceRef', panelId: inner.id, thicknessMm: 20, angleDeg: 0, offsetMm: 0 } as const,
      { kind: 'strip', speciesId: 'maple', widthMm: 40 } as const,
    ],
  }
  const firstRow = base.rows[0]
  if (!firstRow) throw new Error('фикстура сломана')
  return {
    ...base,
    panels: [...base.panels, outer],
    rows: [...base.rows, { ...firstRow, id: 'rx', panelId: 'PX' }],
  }
}

describe('buildCutPlan', () => {
  it('перечисляет полосы каждой панели в порядке склейки', () => {
    const plan = buildCutPlan(design)
    const first = plan.panels[0]
    const panel = design.panels.find((p) => p.id === first?.panelId)
    expect(first?.pieces).toHaveLength(panel?.elements.length ?? -1)
    expect(first?.pieces[0]).toMatchObject({ kind: 'strip', elementIndex: 0 })
  })

  it('длина щита берётся из движка и включает kerf, припуск и торцы', () => {
    const plan = buildCutPlan(design)
    for (const p of plan.panels) {
      expect(p.lengthMm).toBeCloseTo(panelLengthMm(design, p.panelId), 9)
      expect(p.widthMm).toBeCloseTo(panelWidthMm(design.panels.find((x) => x.id === p.panelId)!), 9)
    }
  })

  it('толщина строгания щита выше готовой на припуск', () => {
    const plan = buildCutPlan(design)
    const p = plan.panels[0]
    expect(p?.planedThicknessMm).toBeCloseTo(design.board.thicknessMm + design.planingAllowanceMm, 9)
  })

  it('поперечных резов ровно столько, сколько срезов снимается с панели', () => {
    const plan = buildCutPlan(design)
    for (const p of plan.panels) {
      expect(p.crosscuts).toHaveLength(slicesOfPanel(design, p.panelId).length)
    }
  })

  it('номера рядов совпадают с нумерацией на холсте', () => {
    const plan = buildCutPlan(design)
    const bands = rowBandsMm(design)
    expect(plan.rows.map((r) => r.rowId)).toEqual(bands.map((b) => b.id))
    expect(plan.rows.map((r) => r.number)).toEqual(bands.map((_, i) => i + 1))
    const numbered = plan.panels.flatMap((p) => p.crosscuts).filter((c) => c.rowNumber !== null)
    expect(numbered.map((c) => c.rowNumber)).toEqual(expect.arrayContaining([1]))
  })

  it('сводка по породам суммирует ширины полос', () => {
    const plan = buildCutPlan(design)
    for (const p of plan.panels) {
      const sum = p.bySpecies.reduce((s, x) => s + x.totalWidthMm, 0)
      const stripWidth = p.pieces.filter((x) => x.kind === 'strip').reduce((s, x) => s + x.widthMm, 0)
      expect(sum).toBeCloseTo(stripWidth, 9)
    }
  })

  it('вложенные панели идут раньше внешних', () => {
    const plan = buildCutPlan(inlayDesign())
    const outer = plan.panels.findIndex((p) => p.panelId === 'PX')
    const inner = plan.panels.findIndex((p) => p.hasInlay === false)
    expect(inner).toBeLessThan(outer)
    expect(plan.panels[outer]?.hasInlay).toBe(true)
  })

  it('вклейка не получает номера ряда', () => {
    const plan = buildCutPlan(inlayDesign())
    const innerPlan = plan.panels.find((p) => p.crosscuts.some((c) => c.consumer.kind === 'sliceRef'))
    const inlayCut = innerPlan?.crosscuts.find((c) => c.consumer.kind === 'sliceRef')
    expect(inlayCut?.rowNumber).toBeNull()
  })

  it('итоги считают все полосы и все резы', () => {
    const plan = buildCutPlan(design)
    expect(plan.stripCount).toBe(plan.panels.reduce((s, p) => s + p.pieces.filter((x) => x.kind === 'strip').length, 0))
    expect(plan.crosscutCount).toBe(plan.panels.reduce((s, p) => s + p.crosscuts.length, 0))
  })

  it('панель без срезов не роняет расчёт', () => {
    const orphan: Design = { ...design, rows: [] }
    expect(() => buildCutPlan(orphan)).not.toThrow()
    expect(buildCutPlan(orphan).panels.every((p) => p.lengthMm === 0)).toBe(true)
  })
})

describe('buildGlueUpSteps', () => {
  const plan = buildCutPlan(makeCheckerboard())
  const steps = buildGlueUpSteps(plan, 'ru')

  it('нумерует шаги подряд с единицы', () => {
    expect(steps.map((s) => s.number)).toEqual(steps.map((_, i) => i + 1))
  })

  it('идёт от роспуска к финальной склейке', () => {
    const kinds = steps.map((s) => s.kind)
    expect(kinds[0]).toBe('rip')
    expect(kinds.at(-1)).toBe('flatten')
    expect(kinds.indexOf('crosscut')).toBeGreaterThan(kinds.indexOf('glue-panel'))
    expect(kinds.indexOf('glue-panel')).toBeGreaterThan(kinds.indexOf('rip'))
    expect(kinds.indexOf('final-glue')).toBeGreaterThan(kinds.lastIndexOf('crosscut'))
  })

  it('на каждую панель приходится роспуск, склейка, строгание и рез', () => {
    for (const p of plan.panels) {
      for (const kind of ['rip', 'glue-panel', 'plane', 'crosscut'] as const) {
        expect(steps.some((s) => s.kind === kind && s.panelId === p.panelId), `${kind} ${p.panelId}`).toBe(true)
      }
    }
  })

  it('подставляет конкретные числа, а не заглушки', () => {
    const rip = steps.find((s) => s.kind === 'rip')
    expect(rip).toBeDefined()
    if (!rip) return
    const text = t('ru', rip.messageKey, rip.params)
    expect(text).toContain('мм')
    expect(text).not.toContain('{')
    expect(text).toContain('(') // дюймы напечатаны рядом
  })

  it('в шаге раскладки перечисляет перевёрнутые и зеркальные ряды', () => {
    const arrange = steps.find((s) => s.kind === 'arrange')
    const text = arrange ? t('ru', arrange.messageKey, arrange.params) : ''
    expect(text).toContain(String(plan.rows.length))
    expect(text.includes('{')).toBe(false)
  })

  it('любой шаг рендерится без незакрытых плейсхолдеров на обеих локалях', () => {
    for (const locale of ['ru', 'en'] as const) {
      for (const step of buildGlueUpSteps(plan, locale)) {
        expect(t(locale, step.messageKey, step.params)).not.toMatch(/\{[a-zA-Z]+\}/)
      }
    }
  })
})

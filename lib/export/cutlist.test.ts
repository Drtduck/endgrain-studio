import { describe, expect, it } from 'vitest'
import { makeCheckerboard } from '@/lib/designs/samples'
import {
  angledWasteMm2,
  baseDesign,
  compile,
  panelLengthMm,
  panelWidthMm,
  rowBandsMm,
  sliceLengthMm,
  slicesOfPanel,
  type Design,
} from '@/lib/engine'
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
    const plan = buildCutPlan(design, 'ru')
    const first = plan.panels[0]
    const panel = design.panels.find((p) => p.id === first?.panelId)
    expect(first?.pieces).toHaveLength(panel?.elements.length ?? -1)
    expect(first?.pieces[0]).toMatchObject({ kind: 'strip', elementIndex: 0 })
  })

  it('длина щита берётся из движка и включает kerf, припуск и торцы', () => {
    const plan = buildCutPlan(design, 'ru')
    for (const p of plan.panels) {
      expect(p.lengthMm).toBeCloseTo(panelLengthMm(design, p.panelId), 9)
      expect(p.widthMm).toBeCloseTo(panelWidthMm(design.panels.find((x) => x.id === p.panelId)!), 9)
    }
  })

  it('толщина строгания щита выше готовой на припуск', () => {
    const plan = buildCutPlan(design, 'ru')
    const p = plan.panels[0]
    expect(p?.planedThicknessMm).toBeCloseTo(design.board.thicknessMm + design.planingAllowanceMm, 9)
  })

  it('поперечных резов ровно столько, сколько срезов снимается с панели', () => {
    const plan = buildCutPlan(design, 'ru')
    for (const p of plan.panels) {
      expect(p.crosscuts).toHaveLength(slicesOfPanel(design, p.panelId).length)
    }
  })

  it('номера рядов совпадают с нумерацией на холсте', () => {
    const plan = buildCutPlan(design, 'ru')
    const bands = rowBandsMm(design)
    expect(plan.rows.map((r) => r.rowId)).toEqual(bands.map((b) => b.id))
    expect(plan.rows.map((r) => r.number)).toEqual(bands.map((_, i) => i + 1))
    const numbered = plan.panels.flatMap((p) => p.crosscuts).filter((c) => c.rowNumber !== null)
    expect(numbered.map((c) => c.rowNumber)).toEqual(expect.arrayContaining([1]))
  })

  it('сводка по породам суммирует ширины полос', () => {
    const plan = buildCutPlan(design, 'ru')
    for (const p of plan.panels) {
      const sum = p.bySpecies.reduce((s, x) => s + x.totalWidthMm, 0)
      const stripWidth = p.pieces.filter((x) => x.kind === 'strip').reduce((s, x) => s + x.widthMm, 0)
      expect(sum).toBeCloseTo(stripWidth, 9)
    }
  })

  it('вложенные панели идут раньше внешних', () => {
    const plan = buildCutPlan(inlayDesign(), 'ru')
    const outer = plan.panels.findIndex((p) => p.panelId === 'PX')
    const inner = plan.panels.findIndex((p) => p.hasInlay === false)
    expect(inner).toBeLessThan(outer)
    expect(plan.panels[outer]?.hasInlay).toBe(true)
  })

  it('вклейка не получает номера ряда', () => {
    const plan = buildCutPlan(inlayDesign(), 'ru')
    const innerPlan = plan.panels.find((p) => p.crosscuts.some((c) => c.consumer.kind === 'sliceRef'))
    const inlayCut = innerPlan?.crosscuts.find((c) => c.consumer.kind === 'sliceRef')
    expect(inlayCut?.rowNumber).toBeNull()
  })

  it('итоги считают все полосы и все резы', () => {
    const plan = buildCutPlan(design, 'ru')
    expect(plan.stripCount).toBe(plan.panels.reduce((s, p) => s + p.pieces.filter((x) => x.kind === 'strip').length, 0))
    expect(plan.crosscutCount).toBe(plan.panels.reduce((s, p) => s + p.crosscuts.length, 0))
  })

  it('панель без срезов не роняет расчёт', () => {
    const orphan: Design = { ...design, rows: [] }
    expect(() => buildCutPlan(orphan, 'ru')).not.toThrow()
    expect(buildCutPlan(orphan, 'ru').panels.every((p) => p.lengthMm === 0)).toBe(true)
  })

  it('регрессия: габариты доски в плане берутся из скомпилированной модели, а не из target-размеров дизайна', () => {
    // Пользователь подвинул слайдеры размера доски (target 300x400), но полосы не перефитились:
    // фактическая склеенная доска остаётся 240x240. PDF, превью и карта раскроя должны
    // сходиться на одной цифре, иначе доску по инструкции не собрать.
    const mismatched: Design = {
      ...design,
      board: { ...design.board, targetWidthMm: 300, targetLengthMm: 400 },
    }
    const model = compile(mismatched)
    const plan = buildCutPlan(mismatched, 'ru')
    expect(plan.boardWidthMm).toBe(model.widthMm)
    expect(plan.boardLengthMm).toBe(model.lengthMm)
    expect(plan.boardWidthMm).toBe(240)
    expect(plan.boardLengthMm).toBe(240)
    expect(plan.boardWidthMm).not.toBe(300)
    expect(plan.boardLengthMm).not.toBe(400)
  })
})

describe('buildGlueUpSteps', () => {
  const plan = buildCutPlan(makeCheckerboard(), 'ru')
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

  it('регрессия: русское склонение числительного в шагах crosscut и gluePanel для 1, 2 и 5', () => {
    // Одна панель с ровно 1, 2 и 5 полосами: три панели, чтобы получить все три формы разом.
    const glueDesign: Design = {
      ...design,
      panels: [
        { id: 'ONE', elements: [{ kind: 'strip', speciesId: 'maple', widthMm: 30 }] },
        { id: 'TWO', elements: [{ kind: 'strip', speciesId: 'maple', widthMm: 30 }, { kind: 'strip', speciesId: 'maple', widthMm: 30 }] },
        {
          id: 'FIVE',
          elements: Array.from({ length: 5 }, () => ({ kind: 'strip' as const, speciesId: 'maple' as const, widthMm: 30 })),
        },
      ],
      rows: [
        { id: 'g1', panelId: 'ONE', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 },
        { id: 'g2', panelId: 'TWO', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 },
        { id: 'g3', panelId: 'FIVE', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 },
      ],
    }
    const glueSteps = buildGlueUpSteps(buildCutPlan(glueDesign, 'ru'), 'ru')
    const gluePanelSteps = glueSteps.filter((s) => s.kind === 'glue-panel')
    const byPanel = (id: string) => gluePanelSteps.find((s) => s.panelId === id)
    expect(t('ru', byPanel('ONE')!.messageKey, byPanel('ONE')!.params)).toContain('из 1 заготовки')
    expect(t('ru', byPanel('TWO')!.messageKey, byPanel('TWO')!.params)).toContain('из 2 заготовок')
    expect(t('ru', byPanel('FIVE')!.messageKey, byPanel('FIVE')!.params)).toContain('из 5 заготовок')

    // crosscut: панель со срезами вложенного щита, число вклеек 1/2/5.
    const inner = design.panels[0]
    if (!inner) throw new Error('фикстура сломана')
    const crosscutDesign = (count: number): Design => ({
      ...design,
      panels: [
        inner,
        {
          id: 'CC',
          elements: Array.from({ length: count }, () => ({ kind: 'sliceRef' as const, panelId: inner.id, thicknessMm: 5, angleDeg: 0, offsetMm: 0 })),
        },
      ],
      rows: [{ id: 'cc', panelId: 'CC', thicknessMm: 5 * count, angleDeg: 0, flip: false, mirror: false, trimMm: 5 }],
    })
    const crosscutWord = (count: number): string => {
      const p = buildCutPlan(crosscutDesign(count), 'ru')
      const steps = buildGlueUpSteps(p, 'ru')
      const step = steps.find((s) => s.kind === 'crosscut' && s.panelId === inner.id)
      return t('ru', step!.messageKey, step!.params)
    }
    expect(crosscutWord(1)).toContain('на 1 срез:')
    expect(crosscutWord(2)).toContain('на 2 среза:')
    expect(crosscutWord(5)).toContain('на 5 срезов:')
  })
})

/**
 * Панель Q из одной полосы, срез P (SliceRef) снят с Q под углом angleDeg и вклеен
 * единственной колонкой ряда r1 (ряд остаётся прямым, наклон только на срезе).
 */
function angledDesign(angleDeg: number, opts: { flip?: boolean } = {}): Design {
  return baseDesign({
    panels: [
      { id: 'Q', elements: [{ kind: 'strip', speciesId: 'walnut', widthMm: 20 }] },
      { id: 'P', elements: [{ kind: 'sliceRef', panelId: 'Q', thicknessMm: 15, angleDeg, offsetMm: 0, flip: opts.flip ?? false }] },
    ],
    rows: [{ id: 'r1', panelId: 'P', thicknessMm: 20, angleDeg: 0, flip: false, mirror: false, trimMm: 5 }],
  })
}

describe('buildCutPlan: угловой срез', () => {
  const angled = angledDesign(30)
  const straight = angledDesign(0)

  it('рез, снимаемый с Q, несёт свой угол и честную длину заготовки sourceWidthMm / cos φ', () => {
    const plan = buildCutPlan(angled, 'ru')
    const panelQ = plan.panels.find((p) => p.panelId === 'Q')
    expect(panelQ).toBeDefined()
    const cut = panelQ!.crosscuts[0]
    expect(cut).toBeDefined()
    expect(cut!.angleDeg).toBe(30)
    // sourceWidthMm панели Q - 20 мм (одна полоса), sliceLengthMm = 20 / cos 30°.
    expect(cut!.lengthMm).toBeCloseTo(20 / Math.cos((30 * Math.PI) / 180), 9)
    expect(cut!.lengthMm).toBeCloseTo(sliceLengthMm(slicesOfPanel(angled, 'Q')[0]!), 9)
  })

  it('прямой рез (φ=0) не меняет числа: lengthMm равен sourceWidthMm, angleDeg 0', () => {
    const plan = buildCutPlan(straight, 'ru')
    const cut = plan.panels.find((p) => p.panelId === 'Q')!.crosscuts[0]!
    expect(cut.angleDeg).toBe(0)
    expect(cut.lengthMm).toBeCloseTo(20, 9)
  })

  it('panel.angledWasteMm2 берётся из lib/engine/panels.angledWasteMm2, endWasteMm - линейный аналог', () => {
    const plan = buildCutPlan(angled, 'ru')
    const panelQ = plan.panels.find((p) => p.panelId === 'Q')!
    expect(panelQ.angledWasteMm2).toBeCloseTo(angledWasteMm2(angled, 'Q'), 9)
    expect(panelQ.angledWasteMm2).toBeGreaterThan(0)
    // Клин W * tan(30°), W = 20 мм.
    expect(panelQ.endWasteMm).toBeCloseTo(20 * Math.tan((30 * Math.PI) / 180), 9)

    const straightPlan = buildCutPlan(straight, 'ru')
    const straightQ = straightPlan.panels.find((p) => p.panelId === 'Q')!
    expect(straightQ.angledWasteMm2).toBe(0)
    expect(straightQ.endWasteMm).toBe(0)
  })

  it('hasAngledCuts честно отражает наличие угловых резов в проекте', () => {
    expect(buildCutPlan(angled, 'ru').hasAngledCuts).toBe(true)
    expect(buildCutPlan(straight, 'ru').hasAngledCuts).toBe(false)
  })

  it('ручная сверка: длина заготовки среза + отход на угол согласуются с panelLengthMm панели-источника', () => {
    const plan = buildCutPlan(angled, 'ru')
    const panelQ = plan.panels.find((p) => p.panelId === 'Q')!
    // Отход на угол панели Q, пересчитанный из cutlist-полей, совпадает с формулой движка.
    const rad = (30 * Math.PI) / 180
    const cutContrib = (15 + angled.planingAllowanceMm + 0) / Math.cos(rad)
    const wasteLen = 20 * Math.abs(Math.tan(rad))
    expect(cutContrib + wasteLen).toBeCloseTo(panelQ.lengthMm, 9)
    expect(wasteLen).toBeCloseTo(panelQ.endWasteMm, 9)
  })
})

describe('buildGlueUpSteps: угловой срез', () => {
  it('добавляет шаг angled-setup перед распуском щита-источника', () => {
    const plan = buildCutPlan(angledDesign(30), 'ru')
    const steps = buildGlueUpSteps(plan, 'ru')
    const setupIndex = steps.findIndex((s) => s.kind === 'angled-setup')
    const crosscutIndex = steps.findIndex((s) => s.kind === 'crosscut' && s.panelId === 'Q')
    expect(setupIndex).toBeGreaterThanOrEqual(0)
    expect(setupIndex).toBeLessThan(crosscutIndex)
    const text = t('ru', steps[setupIndex]!.messageKey, steps[setupIndex]!.params)
    expect(text).toContain('30')
    expect(text).not.toContain('{')
  })

  it('не добавляет angled-setup для прямых узоров (регрессия)', () => {
    const plan = buildCutPlan(angledDesign(0), 'ru')
    const steps = buildGlueUpSteps(plan, 'ru')
    expect(steps.some((s) => s.kind === 'angled-setup')).toBe(false)
    expect(steps.filter((s) => s.kind === 'crosscut').every((s) => s.messageKey === 'steps.crosscut')).toBe(true)
  })

  it('шаг crosscut на угловой панели явно упоминает "рез под углом" и длину заготовки', () => {
    const plan = buildCutPlan(angledDesign(30), 'ru')
    const steps = buildGlueUpSteps(plan, 'ru')
    const crosscut = steps.find((s) => s.kind === 'crosscut' && s.panelId === 'Q')
    expect(crosscut?.messageKey).toBe('steps.crosscutAngled')
    const text = t('ru', crosscut!.messageKey, crosscut!.params)
    expect(text).toContain('рез под углом 30°')
    expect(text).not.toContain('{')
  })

  it('шаг inlay перевёрнутого среза (flip=true) явно упоминает переворот', () => {
    const plan = buildCutPlan(angledDesign(30, { flip: true }), 'ru')
    const steps = buildGlueUpSteps(plan, 'ru')
    const inlay = steps.find((s) => s.kind === 'inlay')
    expect(inlay?.messageKey).toBe('steps.inlayFlipped')
    const text = t('ru', inlay!.messageKey, inlay!.params)
    expect(text).toContain('перевернуть')

    const plainPlan = buildCutPlan(angledDesign(30, { flip: false }), 'ru')
    const plainInlay = buildGlueUpSteps(plainPlan, 'ru').find((s) => s.kind === 'inlay')
    expect(plainInlay?.messageKey).toBe('steps.inlay')
  })

  it('любой шаг, включая angled-setup и crosscutAngled, рендерится без незакрытых плейсхолдеров на обеих локалях', () => {
    const plan = buildCutPlan(angledDesign(30, { flip: true }), 'ru')
    for (const locale of ['ru', 'en'] as const) {
      for (const step of buildGlueUpSteps(plan, locale)) {
        expect(t(locale, step.messageKey, step.params)).not.toMatch(/\{[a-zA-Z]+\}/)
      }
    }
  })
})

/**
 * Панель INNER шаблона chevron-classic (lib/designs/templates.ts): 4 среза по 70 мм с щита
 * шириной 250 мм (10 полос по 25), угол чередуется 45/-45/45/-45. Контрольные цифры - те же,
 * что и в lib/engine/panels.test.ts (усадка формулы на chevron-classic): endWaste 750 мм,
 * panelLength(INNER) ≈ 1175.68 мм. cutlist обязан сходиться с движком до девятого знака,
 * а не пересчитывать отход по-своему.
 */
function chevronClassicInnerDesign(): Design {
  const innerPanel = {
    id: 'INNER',
    elements: Array.from({ length: 10 }, (_, i) => ({
      kind: 'strip' as const,
      speciesId: i % 2 === 0 ? ('walnut' as const) : ('maple' as const),
      widthMm: 25,
    })),
  }
  return baseDesign({
    panels: [
      innerPanel,
      {
        id: 'MAIN',
        elements: [45, -45, 45, -45].map((angleDeg, index) => ({
          kind: 'sliceRef' as const,
          panelId: 'INNER',
          thicknessMm: 70,
          angleDeg,
          offsetMm: index,
        })),
      },
    ],
    rows: [{ id: 'r1', panelId: 'MAIN', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 }],
    kerfMm: 3,
    planingAllowanceMm: 3,
  })
}

describe('buildCutPlan: несколько различных углов на одной панели (chevron-classic), сверка с panels.ts', () => {
  it('crosscuts панели INNER отсортированы по углу (группировка: сначала все резы одного угла)', () => {
    const plan = buildCutPlan(chevronClassicInnerDesign(), 'ru')
    const innerPlan = plan.panels.find((p) => p.panelId === 'INNER')!
    const angles = innerPlan.crosscuts.map((c) => c.angleDeg)
    expect(angles).toEqual([...angles].sort((a, b) => a - b))
    expect(angles).toEqual([-45, -45, 45, 45])
  })

  it('endWasteMm панели INNER = 750 мм, совпадает с моделью движка', () => {
    const design = chevronClassicInnerDesign()
    const plan = buildCutPlan(design, 'ru')
    const innerPlan = plan.panels.find((p) => p.panelId === 'INNER')!
    expect(innerPlan.endWasteMm).toBeCloseTo(750, 6)
  })

  it('lengthMm и angledWasteMm2 панели INNER сходятся с lib/engine/panels.ts до девятого знака', () => {
    const design = chevronClassicInnerDesign()
    const plan = buildCutPlan(design, 'ru')
    const innerPlan = plan.panels.find((p) => p.panelId === 'INNER')!
    expect(innerPlan.lengthMm).toBeCloseTo(panelLengthMm(design, 'INNER'), 9)
    expect(innerPlan.lengthMm).toBeCloseTo(1175.678, 2)
    expect(innerPlan.angledWasteMm2).toBeCloseTo(angledWasteMm2(design, 'INNER'), 9)
  })

  it('шаги angled-setup идут по одному на каждый различный угол, в порядке сортировки, без незакрытых плейсхолдеров', () => {
    const design = chevronClassicInnerDesign()
    const plan = buildCutPlan(design, 'ru')
    const steps = buildGlueUpSteps(plan, 'ru')
    const setupSteps = steps.filter((s) => s.kind === 'angled-setup' && s.panelId === 'INNER')
    expect(setupSteps.map((s) => s.params.angleDeg)).toEqual([-45, 45])
    for (const locale of ['ru', 'en'] as const) {
      for (const step of buildGlueUpSteps(plan, locale)) {
        expect(t(locale, step.messageKey, step.params)).not.toMatch(/\{[a-zA-Z]+\}/)
      }
    }
  })
})

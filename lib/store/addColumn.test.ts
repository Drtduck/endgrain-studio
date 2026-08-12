import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { baseDesign, isStrip, panelWidthMm, validate, type Design } from '@/lib/engine'
import { makeCheckerboard } from '@/lib/designs/samples'
import { createStudioStore, selectDesign } from './studio'

const panel = (d: Design, id: string) => d.panels.find((p) => p.id === id)

describe('studio store: addColumn', () => {
  it('добавляет полосу во все панели, на которые ссылается хотя бы один ряд', () => {
    const store = createStudioStore(makeCheckerboard({ cols: 4, rows: 4 }))
    store.getState().addColumn(null)
    const design = selectDesign(store.getState())
    expect(panel(design, 'A')?.elements).toHaveLength(5)
    expect(panel(design, 'B')?.elements).toHaveLength(5)
  })

  it('не трогает панель, на которую не ссылается ни один ряд', () => {
    const store = createStudioStore(
      baseDesign({
        panels: [
          { id: 'A', elements: [{ kind: 'strip', speciesId: 'walnut', widthMm: 25 }] },
          { id: 'B', elements: [] },
        ],
        rows: [{ id: 'r1', panelId: 'A', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 }],
      }),
    )
    store.getState().addColumn(null)
    const design = selectDesign(store.getState())
    expect(panel(design, 'A')?.elements).toHaveLength(2)
    expect(panel(design, 'B')?.elements).toHaveLength(0)
  })

  it('продолжает чередование пород по предпредыдущей полосе, а не просто копирует соседа', () => {
    const store = createStudioStore(makeCheckerboard({ cols: 4, rows: 2 }))
    store.getState().addColumn(null)
    const els = panel(selectDesign(store.getState()), 'A')?.elements ?? []
    expect(els).toHaveLength(5)
    const last = els.at(-1)
    const prevPrev = els.at(-3)
    expect(last && isStrip(last) ? last.speciesId : null).toBe(prevPrev && isStrip(prevPrev) ? prevPrev.speciesId : null)
  })

  it('клампит индекс по длине каждой панели отдельно', () => {
    const store = createStudioStore(
      baseDesign({
        panels: [
          { id: 'A', elements: [{ kind: 'strip', speciesId: 'walnut', widthMm: 25 }] },
          {
            id: 'B',
            elements: [
              { kind: 'strip', speciesId: 'maple', widthMm: 25 },
              { kind: 'strip', speciesId: 'walnut', widthMm: 25 },
              { kind: 'strip', speciesId: 'maple', widthMm: 25 },
            ],
          },
        ],
        rows: [
          { id: 'r1', panelId: 'A', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 },
          { id: 'r2', panelId: 'B', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 },
        ],
      }),
    )
    store.getState().addColumn(10) // за пределами обеих панелей: должно клампиться к концу каждой
    const design = selectDesign(store.getState())
    expect(panel(design, 'A')?.elements).toHaveLength(2)
    expect(panel(design, 'B')?.elements).toHaveLength(4)
  })

  it('после addColumn нет диагностики RAGGED_BOARD', () => {
    const store = createStudioStore(makeCheckerboard({ cols: 3, rows: 4 }))
    store.getState().addColumn(1)
    const diags = validate(selectDesign(store.getState()))
    expect(diags.some((d) => d.code === 'RAGGED_BOARD')).toBe(false)
  })

  it('одна вставка колонки - один шаг отмены', () => {
    const store = createStudioStore(makeCheckerboard({ cols: 3, rows: 2 }))
    store.getState().addColumn(null)
    store.getState().undo()
    expect(panel(selectDesign(store.getState()), 'A')?.elements).toHaveLength(3)
  })
})

describe('studio store: addColumn - свойства', () => {
  it('сохраняет равную ширину используемых панелей и не даёт RAGGED_BOARD', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 6 }),
        fc.integer({ min: 0, max: 8 }),
        fc.boolean(),
        (cols, rawIndex, useNull) => {
          const store = createStudioStore(makeCheckerboard({ cols, rows: 2 }))
          store.getState().addColumn(useNull ? null : rawIndex)
          const next = selectDesign(store.getState())
          const a = panel(next, 'A')
          const b = panel(next, 'B')
          expect(a).toBeDefined()
          expect(b).toBeDefined()
          if (a && b) expect(panelWidthMm(a)).toBeCloseTo(panelWidthMm(b), 6)
          const diags = validate(next)
          expect(diags.some((d) => d.code === 'RAGGED_BOARD')).toBe(false)
        },
      ),
    )
  })
})

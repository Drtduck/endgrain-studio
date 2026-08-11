import { describe, it, expect } from 'vitest'
import { baseDesign, elementExtentMm, isStrip, type Design } from '@/lib/engine'
import { createStudioStore, selectCanUndo, selectDesign } from './studio'

const panelA = (d: Design) => d.panels.find((p) => p.id === 'A')

describe('studio store: панели', () => {
  it('меняет ширину полосы', () => {
    const store = createStudioStore(baseDesign())
    store.getState().setStripWidth('A', 0, 40)
    expect(panelA(selectDesign(store.getState()))?.elements[0]).toMatchObject({ widthMm: 40 })
    store.getState().undo()
    expect(panelA(selectDesign(store.getState()))?.elements[0]).toMatchObject({ widthMm: 25 })
  })

  it('игнорирует несуществующий индекс и нечисловую ширину', () => {
    const store = createStudioStore(baseDesign())
    store.getState().setStripWidth('A', 99, 40)
    store.getState().setStripWidth('A', 0, Number.NaN)
    store.getState().setStripWidth('нет', 0, 40)
    expect(selectCanUndo(store.getState())).toBe(false)
  })

  it('меняет породу полосы', () => {
    const store = createStudioStore(baseDesign())
    store.getState().setStripSpecies('A', 1, 'padauk')
    expect(panelA(selectDesign(store.getState()))?.elements[1]).toMatchObject({ speciesId: 'padauk' })
  })

  it('добавляет полосу активной породы шириной соседа слева', () => {
    const store = createStudioStore(baseDesign())
    store.getState().setActiveSpecies('padauk')
    store.getState().addStrip('A', 1)
    const els = panelA(selectDesign(store.getState()))?.elements ?? []
    expect(els).toHaveLength(3)
    expect(els[1]).toMatchObject({ kind: 'strip', speciesId: 'padauk', widthMm: 25 })
  })

  it('добавляет полосу шириной 25 мм в пустую панель', () => {
    const store = createStudioStore(baseDesign({ panels: [{ id: 'A', elements: [] }], rows: [] }))
    store.getState().addStrip('A', 0)
    expect(panelA(selectDesign(store.getState()))?.elements[0]).toMatchObject({ widthMm: 25 })
  })

  it('удаляет полосу и допускает пустую панель', () => {
    const store = createStudioStore(baseDesign())
    store.getState().removeStrip('A', 0)
    store.getState().removeStrip('A', 0)
    expect(panelA(selectDesign(store.getState()))?.elements).toHaveLength(0)
  })

  it('разрезает полосу на две по миллиметрам', () => {
    const store = createStudioStore(baseDesign())
    store.getState().splitStripAt('A', 0, 10)
    const els = panelA(selectDesign(store.getState()))?.elements ?? []
    expect(els).toHaveLength(3)
    expect(els[0] && isStrip(els[0]) ? els[0].widthMm : 0).toBe(10)
    expect(els[1] && isStrip(els[1]) ? els[1].widthMm : 0).toBe(15)
  })

  it('не разрезает за пределами полосы', () => {
    const store = createStudioStore(baseDesign())
    store.getState().splitStripAt('A', 0, 999)
    expect(selectCanUndo(store.getState())).toBe(false)
  })

  it('переставляет полосы местами', () => {
    const store = createStudioStore(baseDesign())
    const before = panelA(selectDesign(store.getState()))?.elements.map((e) => (isStrip(e) ? e.speciesId : '?'))
    store.getState().moveStrip('A', 0, 1)
    const after = panelA(selectDesign(store.getState()))?.elements.map((e) => (isStrip(e) ? e.speciesId : '?'))
    expect(after).toEqual([...(before ?? [])].reverse())
  })

  it('не переставляет по неверному индексу', () => {
    const store = createStudioStore(baseDesign())
    store.getState().moveStrip('A', 0, 7)
    expect(selectCanUndo(store.getState())).toBe(false)
  })

  it('сумма ширин панели сохраняется при разрезе', () => {
    const store = createStudioStore(baseDesign())
    const sum = (d: Design) => (panelA(d)?.elements ?? []).reduce((s, e) => s + elementExtentMm(e), 0)
    const before = sum(selectDesign(store.getState()))
    store.getState().splitStripAt('A', 0, 7)
    expect(sum(selectDesign(store.getState()))).toBeCloseTo(before, 6)
  })
})

describe('studio store: ряды', () => {
  it('меняет толщину, припуск и панель ряда', () => {
    const store = createStudioStore(baseDesign())
    store.getState().setRowThickness('r1', 35)
    store.getState().setRowTrim('r1', 8)
    store.getState().setRowPanel('r1', 'B')
    const row = selectDesign(store.getState()).rows[0]
    expect(row).toMatchObject({ thicknessMm: 35, trimMm: 8, panelId: 'B' })
  })

  it('переключает flip и mirror', () => {
    const store = createStudioStore(baseDesign())
    store.getState().toggleRowFlip('r1')
    store.getState().toggleRowMirror('r1')
    expect(selectDesign(store.getState()).rows[0]).toMatchObject({ flip: true, mirror: true })
    store.getState().toggleRowFlip('r1')
    expect(selectDesign(store.getState()).rows[0]).toMatchObject({ flip: false, mirror: true })
  })

  it('добавляет ряд копией указанного и даёт ему свободный id', () => {
    const store = createStudioStore(baseDesign())
    store.getState().addRow('r1')
    const rows = selectDesign(store.getState()).rows
    expect(rows).toHaveLength(3)
    expect(rows[1]?.id).toBe('r3')
    expect(rows[1]?.panelId).toBe('A')
    expect(new Set(rows.map((r) => r.id)).size).toBe(3)
  })

  it('добавляет ряд в конец, когда ряд-образец не указан', () => {
    const store = createStudioStore(baseDesign())
    store.getState().addRow(null)
    const rows = selectDesign(store.getState()).rows
    expect(rows).toHaveLength(3)
    expect(rows[2]?.panelId).toBe('B')
  })

  it('создаёт первый ряд на первой панели, когда рядов нет', () => {
    const store = createStudioStore(baseDesign({ rows: [] }))
    store.getState().addRow(null)
    expect(selectDesign(store.getState()).rows[0]).toMatchObject({
      id: 'r1', panelId: 'A', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5,
    })
  })

  it('не создаёт ряд, когда в проекте нет панелей', () => {
    const store = createStudioStore(baseDesign({ panels: [], rows: [] }))
    store.getState().addRow(null)
    expect(selectCanUndo(store.getState())).toBe(false)
  })

  it('удаляет ряд', () => {
    const store = createStudioStore(baseDesign())
    store.getState().removeRow('r1')
    expect(selectDesign(store.getState()).rows.map((r) => r.id)).toEqual(['r2'])
  })

  it('переставляет ряды местами', () => {
    const store = createStudioStore(baseDesign())
    store.getState().moveRow(0, 1)
    expect(selectDesign(store.getState()).rows.map((r) => r.id)).toEqual(['r2', 'r1'])
  })

  it('игнорирует неизвестный ряд', () => {
    const store = createStudioStore(baseDesign())
    store.getState().setRowThickness('нет', 35)
    store.getState().toggleRowFlip('нет')
    store.getState().removeRow('нет')
    expect(selectCanUndo(store.getState())).toBe(false)
  })
})

import { describe, it, expect } from 'vitest'
import { compile, type Cell, type Design } from '@/lib/engine'
import { baseDesign } from '@/lib/engine'
import { makeCheckerboard } from '@/lib/designs/samples'
import { createStudioStore, selectCanUndo, selectDesign } from './studio'

function cellById(design: Design, id: string): Cell {
  const cell = compile(design).cells.find((c) => c.id === id)
  if (!cell) throw new Error(`ячейка ${id} не найдена`)
  return cell
}

describe('studio store: покраска', () => {
  it('красит на месте, когда панель используется одним рядом', () => {
    // baseDesign: панель A используется только рядом r1, форк не нужен.
    const design = baseDesign()
    const store = createStudioStore(design)
    store.getState().paintCell(cellById(design, 'r1:0'))
    expect(selectDesign(store.getState()).panels[0]?.elements[0]).toMatchObject({ speciesId: 'walnut' })
    store.getState().setActiveSpecies('padauk')
    store.getState().paintCell(cellById(selectDesign(store.getState()), 'r1:0'))
    expect(selectDesign(store.getState()).panels[0]?.elements[0]).toMatchObject({ speciesId: 'padauk' })
    expect(store.getState().pendingFork).toBe(null)
    expect(store.getState().selectedCellId).toBe('r1:0')
  })

  it('одна покраска на месте это один шаг отмены', () => {
    const design = baseDesign()
    const store = createStudioStore(design)
    store.getState().setActiveSpecies('padauk')
    store.getState().paintCell(cellById(design, 'r1:0'))
    store.getState().undo()
    expect(selectDesign(store.getState()).panels[0]?.elements[0]).toMatchObject({ speciesId: 'walnut' })
    expect(selectCanUndo(store.getState())).toBe(false)
  })

  it('покраска той же породой ничего не делает', () => {
    const design = baseDesign()
    const store = createStudioStore(design)
    store.getState().setActiveSpecies('walnut')
    store.getState().paintCell(cellById(design, 'r1:0'))
    expect(selectCanUndo(store.getState())).toBe(false)
    expect(store.getState().pendingFork).toBe(null)
  })

  it('переиспользуемая панель не красится сразу, а открывает диалог с ценой', () => {
    const design = makeCheckerboard({ cols: 2, rows: 4 })
    const store = createStudioStore(design)
    store.getState().setActiveSpecies('padauk')
    store.getState().paintCell(cellById(design, 'r0:0'))
    const pending = store.getState().pendingFork
    expect(pending).not.toBe(null)
    expect(pending?.cellId).toBe('r0:0')
    expect(pending?.speciesId).toBe('padauk')
    expect(pending?.cost.extraGlueUps).toBeGreaterThan(0)
    expect(pending?.forkedPanelIds.length).toBeGreaterThan(0)
    // документ ещё не изменился
    expect(selectCanUndo(store.getState())).toBe(false)
    expect(selectDesign(store.getState())).toBe(design)
  })

  it('подтверждение форка применяет документ одним шагом отмены', () => {
    const design = makeCheckerboard({ cols: 2, rows: 4 })
    const store = createStudioStore(design)
    store.getState().setActiveSpecies('padauk')
    store.getState().paintCell(cellById(design, 'r0:0'))
    store.getState().confirmFork()
    expect(store.getState().pendingFork).toBe(null)
    expect(selectDesign(store.getState()).panels.length).toBe(design.panels.length + 1)
    expect(compile(selectDesign(store.getState())).cells.find((c) => c.id === 'r0:0')?.speciesId).toBe('padauk')
    store.getState().undo()
    expect(selectDesign(store.getState()).panels.length).toBe(design.panels.length)
  })

  it('отмена форка не трогает документ', () => {
    const design = makeCheckerboard({ cols: 2, rows: 4 })
    const store = createStudioStore(design)
    store.getState().setActiveSpecies('padauk')
    store.getState().paintCell(cellById(design, 'r0:0'))
    store.getState().cancelFork()
    expect(store.getState().pendingFork).toBe(null)
    expect(selectDesign(store.getState())).toBe(design)
    expect(selectCanUndo(store.getState())).toBe(false)
  })

  it('confirmFork без открытого диалога ничего не делает', () => {
    const store = createStudioStore(baseDesign())
    store.getState().confirmFork()
    expect(selectCanUndo(store.getState())).toBe(false)
  })

  it('клик по ячейке с испорченным происхождением не роняет стор', () => {
    const design = baseDesign()
    const broken: Cell = {
      ...cellById(design, 'r1:0'),
      origin: { rowId: 'r1', panelId: 'A', elementIndex: 99, depth: 0 },
    }
    const store = createStudioStore(design)
    store.getState().setActiveSpecies('padauk')
    expect(() => store.getState().paintCell(broken)).not.toThrow()
    expect(selectCanUndo(store.getState())).toBe(false)
  })
})

describe('studio store: тронутые ячейки', () => {
  it('изначально ни одна ячейка не тронута', () => {
    const store = createStudioStore(baseDesign())
    expect(store.getState().touchedCellIds.size).toBe(0)
  })

  it('покраска на месте помечает ячейку тронутой', () => {
    const design = baseDesign()
    const store = createStudioStore(design)
    store.getState().setActiveSpecies('padauk')
    store.getState().paintCell(cellById(design, 'r1:0'))
    expect(store.getState().touchedCellIds.has('r1:0')).toBe(true)
  })

  it('покраска той же породой (noop) всё равно помечает ячейку тронутой', () => {
    const design = baseDesign()
    const store = createStudioStore(design)
    store.getState().paintCell(cellById(design, 'r1:0'))
    expect(store.getState().touchedCellIds.has('r1:0')).toBe(true)
  })

  it('открытие диалога форка уже помечает ячейку тронутой, до подтверждения', () => {
    const design = makeCheckerboard({ cols: 2, rows: 4 })
    const store = createStudioStore(design)
    store.getState().setActiveSpecies('padauk')
    store.getState().paintCell(cellById(design, 'r0:0'))
    expect(store.getState().touchedCellIds.has('r0:0')).toBe(true)
  })

  it('markCellTouched помечает ячейку напрямую', () => {
    const store = createStudioStore(baseDesign())
    store.getState().markCellTouched('r2:1')
    expect(store.getState().touchedCellIds.has('r2:1')).toBe(true)
  })

  it('loadDesign и resetStudio сбрасывают набор тронутых ячеек', () => {
    const store = createStudioStore(baseDesign())
    store.getState().markCellTouched('r1:0')
    store.getState().loadDesign(baseDesign())
    expect(store.getState().touchedCellIds.size).toBe(0)
    store.getState().markCellTouched('r1:0')
    store.getState().resetStudio()
    expect(store.getState().touchedCellIds.size).toBe(0)
  })
})

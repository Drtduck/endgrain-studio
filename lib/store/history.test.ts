import { describe, it, expect } from 'vitest'
import { baseDesign, type Design } from '@/lib/engine'
import {
  HISTORY_LIMIT,
  canRedo,
  canUndo,
  commit,
  commitValue,
  initHistory,
  redo,
  resetHistory,
  undo,
} from './history'

const start = (): ReturnType<typeof initHistory<Design>> => initHistory(baseDesign())

describe('history', () => {
  it('starts with nothing to undo or redo', () => {
    const h = start()
    expect(canUndo(h)).toBe(false)
    expect(canRedo(h)).toBe(false)
  })

  it('commits a recipe and undoes it back to the original value', () => {
    const h0 = start()
    const h1 = commit(h0, (d) => {
      d.board.thicknessMm = 55
    })
    expect(h1.present.board.thicknessMm).toBe(55)
    expect(h0.present.board.thicknessMm).toBe(40)
    const h2 = undo(h1)
    expect(h2.present.board.thicknessMm).toBe(40)
    expect(canRedo(h2)).toBe(true)
  })

  it('redoes an undone step', () => {
    const h = redo(undo(commit(start(), (d) => { d.kerfMm = 4 })))
    expect(h.present.kerfMm).toBe(4)
    expect(canRedo(h)).toBe(false)
  })

  it('ignores a recipe that changes nothing', () => {
    const h0 = start()
    const h1 = commit(h0, (d) => { d.kerfMm = 3 })
    expect(h1).toBe(h0)
    expect(canUndo(h1)).toBe(false)
  })

  it('drops the redo stack once a new edit lands', () => {
    const h = commit(undo(commit(start(), (d) => { d.kerfMm = 4 })), (d) => { d.kerfMm = 5 })
    expect(canRedo(h)).toBe(false)
    expect(h.present.kerfMm).toBe(5)
  })

  it('commits a whole replacement value and only records the changed keys', () => {
    const h0 = start()
    const next: Design = { ...h0.present, name: 'другое имя' }
    const h1 = commitValue(h0, next)
    expect(h1.present.name).toBe('другое имя')
    expect(h1.past.at(-1)?.patches.map((p) => p.path.join('.'))).toEqual(['name'])
    expect(undo(h1).present.name).toBe(h0.present.name)
  })

  it('keeps at most HISTORY_LIMIT steps and never loses the newest', () => {
    let h = start()
    for (let i = 1; i <= HISTORY_LIMIT + 20; i += 1) h = commit(h, (d) => { d.kerfMm = i })
    expect(h.past).toHaveLength(HISTORY_LIMIT)
    expect(h.present.kerfMm).toBe(HISTORY_LIMIT + 20)
  })

  it('resetHistory forgets the stacks', () => {
    const h = resetHistory(commit(start(), (d) => { d.kerfMm = 4 }), baseDesign())
    expect(canUndo(h)).toBe(false)
    expect(canRedo(h)).toBe(false)
    expect(h.present.kerfMm).toBe(3)
  })

  it('undo and redo on empty stacks return the same object', () => {
    const h = start()
    expect(undo(h)).toBe(h)
    expect(redo(h)).toBe(h)
  })
})

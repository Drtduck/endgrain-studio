import { describe, it, expect } from 'vitest'
import { compile, hasErrors, validate } from '@/lib/engine'
import { shrinkageMap } from '@/lib/species'
import { designDisplayName } from './name'
import { makeCheckerboard } from './samples'

describe('makeCheckerboard', () => {
  it('builds a valid 8 by 8 checkerboard by default', () => {
    const d = makeCheckerboard()
    expect(validate(d, { shrinkageByPct: shrinkageMap() }).filter((x) => x.level === 'error')).toEqual([])
    expect(hasErrors(validate(d))).toBe(false)
    const m = compile(d)
    expect(m.cells).toHaveLength(64)
    expect(m.widthMm).toBeCloseTo(8 * 30, 6)
    expect(m.lengthMm).toBeCloseTo(8 * 30, 6)
    expect(m.glueUpCount).toBe(3)
  })

  it('alternates the two species like a chessboard', () => {
    const m = compile(makeCheckerboard({ cols: 2, rows: 2 }))
    expect(m.cells.map((c) => c.speciesId)).toEqual(['walnut', 'maple', 'maple', 'walnut'])
  })

  it('стартовый документ безымянный и переводится ключом', () => {
    const d = makeCheckerboard()
    expect(d.name).toBe('')
    expect(designDisplayName(d, 'ru')).toBe('Шахматка')
    expect(designDisplayName(d, 'en')).toBe('Checkerboard')
  })

  it('uses exactly two panels regardless of size', () => {
    expect(makeCheckerboard({ cols: 12, rows: 10 }).panels).toHaveLength(2)
  })
})

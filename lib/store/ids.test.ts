import { describe, it, expect } from 'vitest'
import { baseDesign } from '@/lib/engine'
import { nextRowId } from './ids'

describe('nextRowId', () => {
  it('returns an id that is not taken yet', () => {
    const design = baseDesign()
    const id = nextRowId(design)
    expect(design.rows.some((r) => r.id === id)).toBe(false)
  })

  it('skips ids already in use', () => {
    const design = baseDesign({
      rows: [
        { id: 'r1', panelId: 'A', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 },
        { id: 'r3', panelId: 'B', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 },
      ],
    })
    expect(nextRowId(design)).toBe('r4')
  })

  it('works on a design without rows', () => {
    expect(nextRowId(baseDesign({ rows: [] }))).toBe('r1')
  })
})

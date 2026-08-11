import { describe, it, expect } from 'vitest'
import { baseDesign, compile, stripsPanel } from '@/lib/engine'
import { calcProject } from './index'

describe('calcProject', () => {
  const design = baseDesign()
  const model = compile(design)
  const result = calcProject(design, model)

  it('splits lumber by species', () => {
    expect(result.bySpecies.map((s) => s.speciesId).sort()).toEqual(['maple', 'walnut'])
  })

  it('computes raw volume from strip width, planed thickness and panel length', () => {
    // 4 полосы по 25 мм, толщина 40+3, длина панели 38 мм
    expect(result.rawVolumeMm3).toBeCloseTo(4 * 25 * 43 * 38, 4)
  })

  it('computes finished volume from the compiled cells', () => {
    expect(result.finishedVolumeMm3).toBeCloseTo(50 * 60 * 40, 4)
  })

  it('reports waste between 0 and 100 percent', () => {
    expect(result.wastePct).toBeGreaterThan(0)
    expect(result.wastePct).toBeLessThan(100)
  })

  it('passes glue-ups and cuts through from the board model', () => {
    expect(result.glueUpCount).toBe(model.glueUpCount)
    expect(result.cutCount).toBe(model.cutCount)
  })

  it('prices and weighs the board', () => {
    expect(result.totalCostUsd).toBeGreaterThan(0)
    expect(result.totalBoardFeet).toBeCloseTo(result.rawVolumeMm3 / 2359737.216, 6)
    // 120 куб. см ореха и клёна весят меньше килограмма
    expect(result.totalWeightKg).toBeCloseTo((50 * 60 * 40 * ((610 + 705) / 2)) / 1e9, 3)
  })

  it('treats an unknown species as zero cost/weight instead of throwing', () => {
    const withUnknown = baseDesign({
      panels: [stripsPanel('A', ['walnut', 'unobtainium'], 25)],
      rows: [{ id: 'r1', panelId: 'A', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 }],
    })
    const m = compile(withUnknown)
    expect(() => calcProject(withUnknown, m)).not.toThrow()
    const r = calcProject(withUnknown, m)
    const unknown = r.bySpecies.find((s) => s.speciesId === 'unobtainium')
    expect(unknown).toBeDefined()
    expect(unknown?.costUsd).toBe(0)
    expect(unknown?.weightKg).toBe(0)
  })

  it('handles an empty design without dividing by zero', () => {
    const empty = baseDesign({ panels: [], rows: [] })
    const r = calcProject(empty, compile(empty))
    expect(r.wastePct).toBe(0)
    expect(r.bySpecies).toEqual([])
    expect(r.totalCostUsd).toBe(0)
  })
})

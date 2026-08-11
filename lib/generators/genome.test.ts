import { describe, it, expect } from 'vitest'
import { SPECIES_BY_ID } from '@/lib/species'
import { MAX_CELL_MM, MAX_PANEL_WIDTH_MM, MIN_BOARD_SPAN_MM, MIN_CELL_MM, sumMm } from '@/lib/designs/fit'
import { MAX_PALETTE, MIN_PALETTE } from './palette'
import {
  FAMILY_HINTS,
  FAMILY_IDS,
  MAX_BOARD_LENGTH_MM,
  MAX_ROW_MM,
  MIN_ROW_MM,
  clampGenome,
  genomeKey,
  isPermutation,
  mirrorArray,
  randomGenome,
  repairOrder,
  type Genome,
} from './genome'

function expectBuildable(g: Genome): void {
  const widthTotal = sumMm(g.colWidthsMm)
  const lengthTotal = sumMm(g.rowHeightsMm)
  expect(g.colWidthsMm.length).toBe(g.params.cols)
  expect(g.rowHeightsMm.length).toBe(g.params.rows)
  expect(widthTotal).toBeGreaterThanOrEqual(MIN_BOARD_SPAN_MM)
  expect(widthTotal).toBeLessThanOrEqual(MAX_PANEL_WIDTH_MM)
  expect(lengthTotal).toBeGreaterThanOrEqual(MIN_BOARD_SPAN_MM)
  expect(lengthTotal).toBeLessThanOrEqual(MAX_BOARD_LENGTH_MM)
  for (const w of g.colWidthsMm) {
    expect(w).toBeGreaterThanOrEqual(MIN_CELL_MM)
    expect(w).toBeLessThanOrEqual(MAX_CELL_MM)
  }
  for (const h of g.rowHeightsMm) {
    expect(h).toBeGreaterThanOrEqual(MIN_ROW_MM)
    expect(h).toBeLessThanOrEqual(MAX_ROW_MM)
  }
  expect(g.palette.length).toBeGreaterThanOrEqual(MIN_PALETTE)
  expect(g.palette.length).toBeLessThanOrEqual(MAX_PALETTE)
  expect(new Set(g.palette).size).toBe(g.palette.length)
  for (const id of g.palette) expect(SPECIES_BY_ID.has(id)).toBe(true)
  expect(isPermutation(g.rowOrder, g.params.rows)).toBe(true)
  expect(g.params.density).toBeGreaterThanOrEqual(0)
  expect(g.params.density).toBeLessThanOrEqual(1)
  expect(g.params.jitter).toBeGreaterThanOrEqual(0)
  expect(g.params.jitter).toBeLessThanOrEqual(1)
  expect(g.seed).toBeGreaterThanOrEqual(0)
  expect(Number.isInteger(g.seed)).toBe(true)
}

describe('isPermutation и repairOrder', () => {
  it('узнаёт настоящую перестановку', () => {
    expect(isPermutation([0, 1, 2], 3)).toBe(true)
    expect(isPermutation([2, 0, 1], 3)).toBe(true)
    expect(isPermutation([0, 0, 1], 3)).toBe(false)
    expect(isPermutation([0, 1], 3)).toBe(false)
    expect(isPermutation([0, 1, 5], 3)).toBe(false)
  })

  it('чинит битый порядок, сохраняя ранжирование', () => {
    expect(repairOrder([5, 1, 9], 3)).toEqual([1, 0, 2])
    expect(repairOrder([], 3)).toEqual([0, 1, 2])
    expect(repairOrder([0, 0, 0, 0], 2)).toEqual([0, 1])
    expect(isPermutation(repairOrder([7, 7, 2, 1, 9], 5), 5)).toBe(true)
  })

  it('детерминирован', () => {
    expect(repairOrder([3, 1, 3, 0], 4)).toEqual(repairOrder([3, 1, 3, 0], 4))
  })
})

describe('mirrorArray', () => {
  it('делает список симметричным относительно центра', () => {
    expect(mirrorArray([1, 2, 3, 4])).toEqual([1, 2, 2, 1])
    expect(mirrorArray([1, 2, 3, 4, 5])).toEqual([1, 2, 3, 2, 1])
    expect(mirrorArray([9])).toEqual([9])
    expect(mirrorArray([])).toEqual([])
  })
})

describe('randomGenome', () => {
  it('на любом семействе и сиде выдаёт изготовимый геном', () => {
    for (const familyId of FAMILY_IDS) {
      for (let seed = 0; seed < 100; seed += 1) {
        expectBuildable(randomGenome(familyId, seed))
      }
    }
  })

  it('детерминирован', () => {
    expect(randomGenome('chaos', 777)).toEqual(randomGenome('chaos', 777))
  })

  it('на разных сидах даёт разные геномы', () => {
    const keys = new Set<string>()
    for (let seed = 0; seed < 50; seed += 1) keys.add(genomeKey(randomGenome('stripes', seed)))
    expect(keys.size).toBeGreaterThanOrEqual(40)
  })

  it('соблюдает подсказки семейства', () => {
    for (const familyId of FAMILY_IDS) {
      const hint = FAMILY_HINTS[familyId]
      for (let seed = 0; seed < 30; seed += 1) {
        const g = randomGenome(familyId, seed)
        if (hint.fixedCols !== undefined) expect(g.params.cols).toBe(hint.fixedCols)
        if (hint.squareCells) {
          expect(g.params.rows).toBe(g.params.cols)
          expect(g.rowHeightsMm).toEqual([...g.colWidthsMm])
        }
        if (hint.mirrorWidths) expect(g.colWidthsMm).toEqual(mirrorArray([...g.colWidthsMm]))
      }
    }
  })

  it('число клеток остаётся далеко от бюджета движка', () => {
    for (const familyId of FAMILY_IDS) {
      const g = randomGenome(familyId, 5)
      expect(g.params.cols * g.params.rows).toBeLessThan(500)
    }
  })
})

describe('clampGenome', () => {
  const broken: Genome = {
    familyId: 'stripes',
    seed: -12.7,
    palette: ['maple', 'maple', 'нет-такой', 'walnut'],
    colWidthsMm: [1, 900, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
    rowHeightsMm: [0],
    rowOrder: [4, 4, 4],
    params: { cols: 99, rows: -3, cellMm: 500, density: 4, jitter: -1 },
  }

  it('чинит заведомо битый геном', () => {
    expectBuildable(clampGenome(broken))
  })

  it('идемпотентен', () => {
    const once = clampGenome(broken)
    expect(clampGenome(once)).toEqual(once)
  })

  it('не трогает уже корректный геном', () => {
    const good = randomGenome('brick', 3)
    expect(clampGenome(good)).toEqual(good)
  })

  it('приводит p4m к квадрату', () => {
    const g = clampGenome({ ...randomGenome('symmetry-p4m', 1), params: { ...randomGenome('symmetry-p4m', 1).params, rows: 5 } })
    expect(g.params.rows).toBe(g.params.cols)
    expect(g.rowHeightsMm).toEqual([...g.colWidthsMm])
  })

  it('держит число колонок инкрустации фиксированным', () => {
    const hint = FAMILY_HINTS.inlay
    const g = clampGenome({ ...randomGenome('inlay', 2), params: { ...randomGenome('inlay', 2).params, cols: 11 } })
    expect(g.params.cols).toBe(hint.fixedCols)
    expect(g.colWidthsMm).toHaveLength(hint.fixedCols ?? 0)
  })
})

describe('genomeKey', () => {
  it('различает геномы и стабилен', () => {
    const a = randomGenome('gradient', 1)
    const b = randomGenome('gradient', 2)
    expect(genomeKey(a)).toBe(genomeKey(a))
    expect(genomeKey(a)).not.toBe(genomeKey(b))
  })
})

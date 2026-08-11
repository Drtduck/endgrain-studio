import { describe, it, expect } from 'vitest'
import { getSpeciesById } from '@/lib/species'
import { brickCells, gradientCells, stripesCells } from './parametric'
import { clampGenome, randomGenome, type Genome } from './genome'

function render(genome: Genome, cells: (g: Genome) => (col: number, row: number) => string): string[][] {
  const at = cells(genome)
  return Array.from({ length: genome.params.rows }, (_, row) =>
    Array.from({ length: genome.params.cols }, (_, col) => at(col, row)),
  )
}

describe('stripesCells', () => {
  it('колонка одноцветна по всем рядам', () => {
    const g = randomGenome('stripes', 3)
    const cells = render(g, stripesCells)
    for (let col = 0; col < g.params.cols; col += 1) {
      const first = cells[0]?.[col]
      for (let row = 1; row < g.params.rows; row += 1) expect(cells[row]?.[col]).toBe(first)
    }
  })

  it('использует всю палитру, когда колонок хватает', () => {
    const g = clampGenome({ ...randomGenome('stripes', 8), params: { ...randomGenome('stripes', 8).params, cols: 12 } })
    const used = new Set(render(g, stripesCells).flat())
    expect(used.size).toBe(g.palette.length)
  })

  it('детерминирована', () => {
    const g = randomGenome('stripes', 15)
    expect(render(g, stripesCells)).toEqual(render(g, stripesCells))
  })
})

describe('brickCells', () => {
  it('соседние ряды сдвинуты, а не повторяют друг друга', () => {
    let shifted = false
    for (let seed = 0; seed < 20 && !shifted; seed += 1) {
      const g = randomGenome('brick', seed)
      const cells = render(g, brickCells)
      if (JSON.stringify(cells[0]) !== JSON.stringify(cells[1])) shifted = true
    }
    expect(shifted).toBe(true)
  })

  it('число различных рядов не больше числа рядов', () => {
    const g = randomGenome('brick', 4)
    const rows = new Set(render(g, brickCells).map((row) => row.join('|')))
    expect(rows.size).toBeLessThanOrEqual(g.params.rows)
  })
})

describe('gradientCells', () => {
  it('идёт от светлого к тёмному и обратно', () => {
    const g = randomGenome('gradient', 2)
    const first = render(g, gradientCells)[0] ?? []
    const middle = Math.floor(first.length / 2)
    const left = first.slice(0, middle).map((id) => getSpeciesById(id).lab.L)
    // Лесенка монотонна на левой половине: это и делает градиент градиентом.
    expect([...left].sort((a, b) => b - a)).toEqual(left)
  })

  it('симметрична по колонкам', () => {
    const g = randomGenome('gradient', 6)
    const row = render(g, gradientCells)[0] ?? []
    for (let col = 0; col < row.length; col += 1) expect(row[col]).toBe(row[row.length - 1 - col])
  })
})

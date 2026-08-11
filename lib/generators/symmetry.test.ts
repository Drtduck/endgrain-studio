import { describe, it, expect } from 'vitest'
import { randomGenome, type Genome } from './genome'
import { makeTile, symmetryCells, tileDims, type SymmetryGroup } from './symmetry'

const GROUPS: readonly SymmetryGroup[] = ['pmm', 'p4m', 'p2']

function grid(genome: Genome, group: SymmetryGroup): string[][] {
  const at = symmetryCells(group)(genome)
  return Array.from({ length: genome.params.rows }, (_, row) =>
    Array.from({ length: genome.params.cols }, (_, col) => at(col, row)),
  )
}

describe('tileDims', () => {
  it('для pmm и p4m берёт четверть, для p2 половину по рядам', () => {
    expect(tileDims('pmm', 8, 10)).toEqual({ w: 4, h: 5 })
    expect(tileDims('p4m', 8, 8)).toEqual({ w: 4, h: 4 })
    expect(tileDims('p2', 8, 10)).toEqual({ w: 8, h: 5 })
  })

  it('нечётные размеры округляет вверх, чтобы центр попал в плитку', () => {
    expect(tileDims('pmm', 7, 9)).toEqual({ w: 4, h: 5 })
  })
})

describe('makeTile', () => {
  it('детерминирована и имеет размер плитки', () => {
    const g = randomGenome('symmetry-pmm', 4)
    const dims = tileDims('pmm', g.params.cols, g.params.rows)
    const tile = makeTile(g, 'pmm')
    expect(tile).toHaveLength(dims.w)
    for (const column of tile) expect(column).toHaveLength(dims.h)
    expect(makeTile(g, 'pmm')).toEqual(tile)
  })

  it('индексы плитки лежат внутри палитры', () => {
    const g = randomGenome('symmetry-p2', 9)
    for (const column of makeTile(g, 'p2')) {
      for (const index of column) {
        expect(index).toBeGreaterThanOrEqual(0)
        expect(index).toBeLessThan(g.palette.length)
      }
    }
  })
})

describe('symmetryCells', () => {
  it('pmm зеркалит по обеим осям', () => {
    const g = randomGenome('symmetry-pmm', 12)
    const cells = grid(g, 'pmm')
    const { cols, rows } = g.params
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        expect(cells[row]?.[col]).toBe(cells[row]?.[cols - 1 - col])
        expect(cells[row]?.[col]).toBe(cells[rows - 1 - row]?.[col])
      }
    }
  })

  it('p4m добавляет диагональное зеркало', () => {
    const g = randomGenome('symmetry-p4m', 21)
    const cells = grid(g, 'p4m')
    const { cols, rows } = g.params
    expect(rows).toBe(cols)
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        expect(cells[row]?.[col]).toBe(cells[col]?.[row])
        expect(cells[row]?.[col]).toBe(cells[row]?.[cols - 1 - col])
      }
    }
  })

  it('p2 симметрична поворотом на 180 градусов', () => {
    const g = randomGenome('symmetry-p2', 33)
    const cells = grid(g, 'p2')
    const { cols, rows } = g.params
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        expect(cells[row]?.[col]).toBe(cells[rows - 1 - row]?.[cols - 1 - col])
      }
    }
  })

  it('p2 не обязана быть зеркальной: иначе это просто pmm', () => {
    let asymmetric = false
    for (let seed = 0; seed < 30 && !asymmetric; seed += 1) {
      const g = randomGenome('symmetry-p2', seed)
      const cells = grid(g, 'p2')
      const { cols, rows } = g.params
      for (let row = 0; row < rows && !asymmetric; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          if (cells[row]?.[col] !== cells[row]?.[cols - 1 - col]) {
            asymmetric = true
            break
          }
        }
      }
    }
    expect(asymmetric).toBe(true)
  })

  it('использует только породы из палитры', () => {
    for (const group of GROUPS) {
      const g = randomGenome(group === 'p4m' ? 'symmetry-p4m' : group === 'pmm' ? 'symmetry-pmm' : 'symmetry-p2', 6)
      for (const row of grid(g, group)) for (const id of row) expect(g.palette).toContain(id)
    }
  })

  it('на разных сидах узор разный', () => {
    const a = grid(randomGenome('symmetry-pmm', 1), 'pmm').flat().join('')
    const b = grid(randomGenome('symmetry-pmm', 2), 'pmm').flat().join('')
    expect(a).not.toBe(b)
  })
})

import { describe, it, expect } from 'vitest'
import { blueNoiseMask, chaosCells } from './noise'
import { randomGenome } from './genome'
import { makeRng } from './random'

function meanNearestDistance(mask: readonly boolean[], cols: number, rows: number): number {
  const points: Array<readonly [number, number]> = []
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) if (mask[row * cols + col] === true) points.push([col, row])
  }
  if (points.length < 2) return 0
  let total = 0
  for (const [x, y] of points) {
    let nearest = Infinity
    for (const [px, py] of points) {
      if (px === x && py === y) continue
      nearest = Math.min(nearest, Math.max(Math.abs(px - x), Math.abs(py - y)))
    }
    total += nearest
  }
  return total / points.length
}

describe('blueNoiseMask', () => {
  it('ставит запрошенное число точек', () => {
    const mask = blueNoiseMask(12, 12, 20, makeRng(1))
    expect(mask.filter(Boolean)).toHaveLength(20)
    expect(mask).toHaveLength(144)
  })

  it('не просит больше точек, чем есть клеток', () => {
    const mask = blueNoiseMask(3, 3, 100, makeRng(2))
    expect(mask.filter(Boolean).length).toBeLessThanOrEqual(9)
  })

  it('детерминирована по сиду', () => {
    expect(blueNoiseMask(10, 10, 15, makeRng(7))).toEqual(blueNoiseMask(10, 10, 15, makeRng(7)))
  })

  it('разносит точки лучше, чем равномерный шум', () => {
    const blue = blueNoiseMask(16, 16, 32, makeRng(9))
    const white: boolean[] = new Array(256).fill(false)
    const rng = makeRng(9)
    let placed = 0
    while (placed < 32) {
      const index = rng.int(256)
      if (white[index] !== true) {
        white[index] = true
        placed += 1
      }
    }
    expect(meanNearestDistance(blue, 16, 16)).toBeGreaterThan(meanNearestDistance(white, 16, 16))
  })

  it('нулевое число точек даёт пустую маску', () => {
    expect(blueNoiseMask(5, 5, 0, makeRng(3)).some(Boolean)).toBe(false)
  })
})

describe('chaosCells', () => {
  it('использует только породы палитры', () => {
    const g = randomGenome('chaos', 11)
    const at = chaosCells(g)
    for (let row = 0; row < g.params.rows; row += 1) {
      for (let col = 0; col < g.params.cols; col += 1) expect(g.palette).toContain(at(col, row))
    }
  })

  it('детерминирована и не зависит от порядка обхода', () => {
    const g = randomGenome('chaos', 13)
    const straight: string[] = []
    const atA = chaosCells(g)
    for (let row = 0; row < g.params.rows; row += 1) for (let col = 0; col < g.params.cols; col += 1) straight.push(atA(col, row))
    const reversed: string[] = []
    const atB = chaosCells(g)
    for (let row = g.params.rows - 1; row >= 0; row -= 1) for (let col = g.params.cols - 1; col >= 0; col -= 1) reversed.push(atB(col, row))
    expect([...reversed].reverse()).toEqual(straight)
  })

  it('плотность управляет числом акцентов', () => {
    const base = randomGenome('chaos', 17)
    const count = (density: number): number => {
      const g = { ...base, params: { ...base.params, density } }
      const at = chaosCells(g)
      let acc = 0
      for (let row = 0; row < g.params.rows; row += 1) {
        for (let col = 0; col < g.params.cols; col += 1) if (at(col, row) !== g.palette[0]) acc += 1
      }
      return acc
    }
    expect(count(0.1)).toBeLessThan(count(0.8))
  })
})

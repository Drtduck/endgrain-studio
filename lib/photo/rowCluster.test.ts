import { describe, it, expect } from 'vitest'
import { clusterRows, rowDistance } from './rowCluster'

const A = [0, 0, 1, 1]
const B = [0, 0, 1, 1]
const C = [1, 1, 0, 0]
const D = [1, 1, 0, 1]

describe('rowDistance', () => {
  it('считает число различий', () => {
    expect(rowDistance(A, B)).toBe(0)
    expect(rowDistance(A, C)).toBe(4)
    expect(rowDistance(C, D)).toBe(1)
  })

  it('разная длина не роняет функцию', () => {
    expect(rowDistance([0, 1], [0, 1, 1])).toBeGreaterThan(0)
  })
})

describe('clusterRows', () => {
  it('находит две группы среди четырёх рядов', () => {
    const result = clusterRows([A, B, C, D], 2, { seed: 1 })
    expect(result.medoids).toHaveLength(2)
    expect(result.labels).toHaveLength(4)
    expect(result.labels[0]).toBe(result.labels[1])
    expect(result.labels[2]).toBe(result.labels[3])
    expect(result.labels[0]).not.toBe(result.labels[2])
  })

  it('медоид всегда один из входных рядов', () => {
    const result = clusterRows([A, B, C, D], 2, { seed: 2 })
    for (const medoid of result.medoids) {
      expect(medoid).toBeGreaterThanOrEqual(0)
      expect(medoid).toBeLessThan(4)
    }
  })

  it('k равное числу рядов оставляет каждый ряд собой', () => {
    const result = clusterRows([A, C, D], 3, { seed: 3 })
    expect(new Set(result.medoids).size).toBe(3)
    result.labels.forEach((label, index) => {
      expect(result.medoids[label]).toBe(index)
    })
  })

  it('k больше числа рядов зажимается', () => {
    expect(clusterRows([A, C], 10, { seed: 4 }).medoids.length).toBeLessThanOrEqual(2)
  })

  it('k равное единице сводит доску к одной панели', () => {
    const result = clusterRows([A, B, C, D], 1, { seed: 5 })
    expect(result.medoids).toHaveLength(1)
    expect(new Set(result.labels).size).toBe(1)
  })

  it('детерминирована по сиду', () => {
    expect(clusterRows([A, B, C, D], 2, { seed: 6 })).toEqual(clusterRows([A, B, C, D], 2, { seed: 6 }))
  })

  it('на очевидных данных не зависит от сида', () => {
    const a = clusterRows([A, B, C, C], 2, { seed: 1 })
    const b = clusterRows([A, B, C, C], 2, { seed: 42 })
    expect(a.labels).toEqual(b.labels)
  })

  it('одинаковые ряды не порождают пустых кластеров', () => {
    const result = clusterRows([A, A, A, A], 3, { seed: 7 })
    expect(new Set(result.labels).size).toBe(result.medoids.length)
  })

  it('пустой вход даёт пустой результат', () => {
    expect(clusterRows([], 3, { seed: 1 })).toEqual({ medoids: [], labels: [] })
  })

  it('увеличение k не увеличивает суммарную ошибку', () => {
    const rows = [A, B, C, D, [0, 1, 0, 1], [1, 0, 1, 0]]
    const cost = (k: number): number => {
      const result = clusterRows(rows, k, { seed: 8 })
      return rows.reduce((acc, row, index) => {
        const medoid = rows[result.medoids[result.labels[index] ?? 0] ?? 0] ?? row
        return acc + rowDistance(row, medoid)
      }, 0)
    }
    expect(cost(4)).toBeLessThanOrEqual(cost(2))
    expect(cost(6)).toBe(0)
  })
})

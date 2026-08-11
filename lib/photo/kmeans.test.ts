import { describe, it, expect } from 'vitest'
import type { Lab } from '@/lib/species'
import { labDistance } from '@/lib/species/lab'
import { kmeansLab } from './kmeans'

/** Три тугих облака в LAB: светлое, среднее, тёмное. Детерминированный синтетический вход. */
function blobs(): Lab[] {
  const centres: Lab[] = [
    { L: 85, a: 4, b: 20 },
    { L: 50, a: 20, b: 30 },
    { L: 18, a: 6, b: 9 },
  ]
  const out: Lab[] = []
  centres.forEach((centre, index) => {
    for (let i = 0; i < 40; i += 1) {
      const wobble = ((i * 37 + index * 11) % 7) - 3
      out.push({ L: centre.L + wobble * 0.4, a: centre.a + wobble * 0.2, b: centre.b - wobble * 0.2 })
    }
  })
  return out
}

describe('kmeansLab', () => {
  it('находит три облака', () => {
    const result = kmeansLab(blobs(), 3, { seed: 1 })
    expect(result.centroids).toHaveLength(3)
    expect(result.labels).toHaveLength(120)
    const found = result.centroids.map((c) => Math.round(c.L))
    expect(found[0]).toBeGreaterThan(80)
    expect(found[2]).toBeLessThan(25)
  })

  it('центроиды отсортированы от светлого к тёмному', () => {
    const result = kmeansLab(blobs(), 3, { seed: 5 })
    const ls = result.centroids.map((c) => c.L)
    expect([...ls].sort((a, b) => b - a)).toEqual(ls)
  })

  it('метки указывают на ближайший центроид', () => {
    const points = blobs()
    const result = kmeansLab(points, 3, { seed: 2 })
    points.forEach((point, index) => {
      const label = result.labels[index] ?? 0
      const own = result.centroids[label]
      if (!own) throw new Error('нет центроида')
      for (const centroid of result.centroids) {
        expect(labDistance(point, own)).toBeLessThanOrEqual(labDistance(point, centroid) + 1e-9)
      }
    })
  })

  it('детерминирован по сиду', () => {
    expect(kmeansLab(blobs(), 4, { seed: 3 })).toEqual(kmeansLab(blobs(), 4, { seed: 3 }))
  })

  it('не зависит от сида, когда кластеры очевидны', () => {
    const a = kmeansLab(blobs(), 3, { seed: 1 }).centroids.map((c) => Math.round(c.L))
    const b = kmeansLab(blobs(), 3, { seed: 999 }).centroids.map((c) => Math.round(c.L))
    expect(a).toEqual(b)
  })

  it('не просит больше кластеров, чем есть точек', () => {
    const result = kmeansLab([{ L: 10, a: 0, b: 0 }, { L: 90, a: 0, b: 0 }], 5, { seed: 1 })
    expect(result.centroids.length).toBeLessThanOrEqual(2)
  })

  it('на пустом входе возвращает пустой результат, а не падает', () => {
    const result = kmeansLab([], 3, { seed: 1 })
    expect(result.centroids).toEqual([])
    expect(result.labels).toEqual([])
  })

  it('однородная картинка не порождает пустых кластеров', () => {
    const flat: Lab[] = new Array(50).fill({ L: 60, a: 5, b: 5 })
    const result = kmeansLab(flat, 4, { seed: 4 })
    const used = new Set(result.labels)
    expect(used.size).toBe(result.centroids.length)
  })

  it('сходится быстрее лимита итераций', () => {
    expect(kmeansLab(blobs(), 3, { seed: 6, maxIter: 50 }).iterations).toBeLessThan(50)
  })
})

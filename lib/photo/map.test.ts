import { describe, it, expect } from 'vitest'
import { SPECIES_BY_ID, getSpeciesById } from '@/lib/species'
import { mapClustersToSpecies } from './map'

describe('mapClustersToSpecies', () => {
  it('точные цвета пород отображаются в самих себя', () => {
    const ids = ['maple', 'cherry', 'wenge'] as const
    const result = mapClustersToSpecies(ids.map((id) => getSpeciesById(id).lab))
    expect(result).toEqual([...ids])
  })

  it('никогда не повторяет породу', () => {
    const walnut = getSpeciesById('walnut').lab
    const result = mapClustersToSpecies([walnut, walnut, walnut])
    expect(new Set(result).size).toBe(3)
    expect(result).toContain('walnut')
  })

  it('возвращает столько пород, сколько кластеров', () => {
    for (let k = 1; k <= 5; k += 1) {
      const centroids = Array.from({ length: k }, (_, i) => ({ L: 20 + i * 15, a: 5, b: 10 }))
      const result = mapClustersToSpecies(centroids)
      expect(result).toHaveLength(k)
      for (const id of result) expect(SPECIES_BY_ID.has(id)).toBe(true)
    }
  })

  it('уважает список разрешённых пород', () => {
    const allowed = ['maple', 'walnut'] as const
    const result = mapClustersToSpecies([{ L: 80, a: 3, b: 20 }, { L: 25, a: 12, b: 18 }], allowed)
    expect(new Set(result)).toEqual(new Set(allowed))
  })

  it('детерминирована', () => {
    const centroids = [{ L: 70, a: 8, b: 25 }, { L: 40, a: 20, b: 28 }]
    expect(mapClustersToSpecies(centroids)).toEqual(mapClustersToSpecies(centroids))
  })

  it('на пустом входе возвращает пустой список', () => {
    expect(mapClustersToSpecies([])).toEqual([])
  })

  it('просит больше пород, чем есть в справочнике: отдаёт сколько может', () => {
    const centroids = Array.from({ length: 20 }, (_, i) => ({ L: i * 5, a: 0, b: 0 }))
    expect(mapClustersToSpecies(centroids).length).toBeLessThanOrEqual(16)
  })
})

import { describe, it, expect } from 'vitest'
import { SPECIES, SPECIES_BY_ID, getSpeciesById } from './index'
import { chroma, labDistance, lightnessRamp, nearestSpecies, speciesDistance, speciesNeighbours } from './lab'

describe('labDistance', () => {
  it('расстояние до себя равно нулю', () => {
    const maple = getSpeciesById('maple')
    expect(labDistance(maple.lab, maple.lab)).toBe(0)
  })

  it('симметрично и считает евклидову норму', () => {
    const a = { L: 0, a: 0, b: 0 }
    const b = { L: 3, a: 4, b: 0 }
    expect(labDistance(a, b)).toBeCloseTo(5, 10)
    expect(labDistance(b, a)).toBeCloseTo(5, 10)
  })

  it('клён к берёзе ближе, чем клён к венге', () => {
    expect(speciesDistance('maple', 'birch')).toBeLessThan(speciesDistance('maple', 'wenge'))
  })
})

describe('nearestSpecies', () => {
  it('точное попадание в породу возвращает её саму', () => {
    for (const species of SPECIES) {
      expect(nearestSpecies(species.lab)).toBe(species.id)
    }
  })

  it('уважает список исключений', () => {
    const walnut = getSpeciesById('walnut')
    expect(nearestSpecies(walnut.lab, ['walnut'])).not.toBe('walnut')
  })

  it('не падает, если исключены все породы', () => {
    const all = SPECIES.map((s) => s.id)
    expect(SPECIES_BY_ID.has(nearestSpecies({ L: 50, a: 0, b: 0 }, all))).toBe(true)
  })
})

describe('speciesNeighbours', () => {
  it('возвращает запрошенное число соседей без самой породы', () => {
    const near = speciesNeighbours('cherry', 3)
    expect(near).toHaveLength(3)
    expect(near).not.toContain('cherry')
    expect(new Set(near).size).toBe(3)
  })

  it('соседи отсортированы по возрастанию расстояния', () => {
    const near = speciesNeighbours('walnut', 5)
    const distances = near.map((id) => speciesDistance('walnut', id))
    expect([...distances].sort((a, b) => a - b)).toEqual(distances)
  })

  it('не выдаёт больше, чем есть пород', () => {
    expect(speciesNeighbours('maple', 100)).toHaveLength(SPECIES.length - 1)
  })
})

describe('lightnessRamp', () => {
  it('идёт от светлого к тёмному', () => {
    const ramp = lightnessRamp()
    const ls = ramp.map((id) => getSpeciesById(id).lab.L)
    expect([...ls].sort((a, b) => b - a)).toEqual(ls)
  })

  it('соседи в лесенке различимы глазом', () => {
    const ramp = lightnessRamp(18)
    for (let i = 1; i < ramp.length; i += 1) {
      const prev = ramp[i - 1]
      const curr = ramp[i]
      if (prev === undefined || curr === undefined) continue
      expect(speciesDistance(prev, curr)).toBeGreaterThanOrEqual(18)
    }
  })

  it('в лесенке достаточно ступеней для градиента', () => {
    expect(lightnessRamp(18).length).toBeGreaterThanOrEqual(5)
  })
})

describe('chroma', () => {
  it('серый бесцветен, падук насыщен', () => {
    expect(chroma({ L: 50, a: 0, b: 0 })).toBe(0)
    expect(chroma(getSpeciesById('padauk').lab)).toBeGreaterThan(chroma(getSpeciesById('walnut').lab))
  })
})

import { describe, it, expect } from 'vitest'
import { SPECIES_BY_ID, getSpeciesById } from '@/lib/species'
import { chroma, speciesDistance } from '@/lib/species/lab'
import { makeRng } from './random'
import {
  MAX_PALETTE,
  MIN_PALETTE,
  MIN_PALETTE_DISTANCE,
  PALETTE_KINDS,
  accentedPalette,
  analogousPalette,
  contrastPalette,
  makePalette,
  sanitisePalette,
} from './palette'

function isReal(ids: readonly string[]): boolean {
  return ids.every((id) => SPECIES_BY_ID.has(id))
}

describe('contrastPalette', () => {
  it('выдаёт запрошенный размер из реальных пород без повторов', () => {
    for (let size = MIN_PALETTE; size <= MAX_PALETTE; size += 1) {
      const ids = contrastPalette(makeRng(size * 17), size)
      expect(ids).toHaveLength(size)
      expect(new Set(ids).size).toBe(size)
      expect(isReal(ids)).toBe(true)
    }
  })

  it('любые две породы в паре различимы глазом', () => {
    for (let seed = 0; seed < 60; seed += 1) {
      const ids = contrastPalette(makeRng(seed), 3)
      for (let i = 0; i < ids.length; i += 1) {
        for (let j = i + 1; j < ids.length; j += 1) {
          const a = ids[i]
          const b = ids[j]
          if (a === undefined || b === undefined) continue
          expect(speciesDistance(a, b)).toBeGreaterThanOrEqual(MIN_PALETTE_DISTANCE)
        }
      }
    }
  })

  it('детерминирована по сиду', () => {
    expect(contrastPalette(makeRng(42), 4)).toEqual(contrastPalette(makeRng(42), 4))
  })

  it('на ста сидах даёт заметное разнообразие', () => {
    const seen = new Set<string>()
    for (let seed = 0; seed < 100; seed += 1) seen.add(contrastPalette(makeRng(seed), 3).join('|'))
    expect(seen.size).toBeGreaterThanOrEqual(20)
  })
})

describe('analogousPalette', () => {
  it('идёт от светлого к тёмному', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const ids = analogousPalette(makeRng(seed), 4)
      const ls = ids.map((id) => getSpeciesById(id).lab.L)
      expect([...ls].sort((a, b) => b - a)).toEqual(ls)
    }
  })

  it('без повторов и нужного размера', () => {
    for (let size = MIN_PALETTE; size <= MAX_PALETTE; size += 1) {
      const ids = analogousPalette(makeRng(size), size)
      expect(ids).toHaveLength(size)
      expect(new Set(ids).size).toBe(size)
    }
  })
})

describe('accentedPalette', () => {
  it('содержит ровно одну насыщенную породу', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const ids = accentedPalette(makeRng(seed), 3)
      const loud = ids.filter((id) => chroma(getSpeciesById(id).lab) > 40)
      expect(loud).toHaveLength(1)
    }
  })

  it('на размере два всё равно возвращает две породы', () => {
    const ids = accentedPalette(makeRng(1), 2)
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
  })
})

describe('makePalette', () => {
  it('зажимает размер в допустимые границы', () => {
    expect(makePalette(makeRng(1), 0)).toHaveLength(MIN_PALETTE)
    expect(makePalette(makeRng(1), 99)).toHaveLength(MAX_PALETTE)
  })

  it('уважает явно заданный вид палитры', () => {
    for (const kind of PALETTE_KINDS) {
      const ids = makePalette(makeRng(7), 3, kind)
      expect(ids).toHaveLength(3)
      expect(isReal(ids)).toBe(true)
    }
  })

  it('без явного вида перебирает все три вида на разных сидах', () => {
    const shapes = new Set<string>()
    for (let seed = 0; seed < 60; seed += 1) shapes.add(makePalette(makeRng(seed), 3).join('|'))
    expect(shapes.size).toBeGreaterThan(10)
  })
})

describe('sanitisePalette', () => {
  it('выбрасывает несуществующие породы', () => {
    const ids = sanitisePalette(['maple', 'нет-такой-породы', 'walnut'], 5, 3)
    expect(isReal(ids)).toBe(true)
    expect(ids).toHaveLength(3)
  })

  it('убирает дубликаты и добирает до размера', () => {
    const ids = sanitisePalette(['maple', 'maple', 'maple'], 9, 4)
    expect(new Set(ids).size).toBe(4)
    expect(ids[0]).toBe('maple')
  })

  it('обрезает лишнее, сохраняя порядок', () => {
    const ids = sanitisePalette(['maple', 'walnut', 'padauk', 'cherry', 'wenge'], 1, 2)
    expect(ids).toEqual(['maple', 'walnut'])
  })

  it('на пустом входе всё равно даёт рабочую палитру', () => {
    const ids = sanitisePalette([], 3, 3)
    expect(ids).toHaveLength(3)
    expect(isReal(ids)).toBe(true)
  })

  it('детерминирована', () => {
    expect(sanitisePalette(['maple'], 8, 4)).toEqual(sanitisePalette(['maple'], 8, 4))
  })
})

import { describe, it, expect } from 'vitest'
import { EngineError } from '@/lib/engine'
import { SPECIES, SPECIES_BY_ID, getSpeciesById, speciesHex } from './index'

describe('species catalogue', () => {
  it('has at least 16 species with unique ids', () => {
    expect(SPECIES.length).toBeGreaterThanOrEqual(16)
    expect(new Set(SPECIES.map((s) => s.id)).size).toBe(SPECIES.length)
  })

  it('stores plausible physical data for every species', () => {
    for (const s of SPECIES) {
      expect(s.hex).toMatch(/^#[0-9a-f]{6}$/)
      expect(s.densityKgM3).toBeGreaterThan(250)
      expect(s.densityKgM3).toBeLessThan(1300)
      expect(s.pricePerBoardFootUsd).toBeGreaterThan(0)
      expect(s.shrinkageTangentialPct).toBeGreaterThan(0)
      expect(s.shrinkageTangentialPct).toBeGreaterThan(s.shrinkageRadialPct)
      expect(s.lab.L).toBeGreaterThanOrEqual(0)
      expect(s.lab.L).toBeLessThanOrEqual(100)
      expect(s.nameRu).not.toContain(String.fromCharCode(0x2014)) // длинное тире запрещено
    }
  })

  it('looks species up by id', () => {
    expect(getSpeciesById('walnut').nameRu).toBe('Орех')
    expect(SPECIES_BY_ID.get('maple')?.nameEn).toBe('Hard maple')
    expect(speciesHex('padauk')).toBe('#a8422a')
  })

  it('throws a typed error for an unknown id', () => {
    expect(() => getSpeciesById('unobtainium')).toThrowError(EngineError)
  })
})

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { baseDesign, type Design } from '@/lib/engine'
import { decodeDesignFromHash, deserializeDesign, encodeDesignToHash, serializeDesign } from './codec'

const speciesArb = fc.constantFrom('walnut', 'maple', 'cherry', 'padauk', 'wenge')

const designArb: fc.Arbitrary<Design> = fc
  .record({
    panelSpecies: fc.array(fc.array(speciesArb, { minLength: 1, maxLength: 6 }), { minLength: 1, maxLength: 5 }),
    widthMm: fc.double({ min: 4, max: 40, noNaN: true, noDefaultInfinity: true }),
    thicknessMm: fc.double({ min: 10, max: 40, noNaN: true, noDefaultInfinity: true }),
    trimMm: fc.double({ min: 0, max: 15, noNaN: true, noDefaultInfinity: true }),
    flags: fc.array(fc.tuple(fc.boolean(), fc.boolean()), { minLength: 1, maxLength: 5 }),
  })
  .map(({ panelSpecies, widthMm, thicknessMm, trimMm, flags }) =>
    baseDesign({
      species: ['walnut', 'maple', 'cherry', 'padauk', 'wenge'],
      panels: panelSpecies.map((ids, i) => ({
        id: `P${i}`,
        elements: ids.map((speciesId) => ({ kind: 'strip' as const, speciesId, widthMm })),
      })),
      rows: panelSpecies.map((_, i) => ({
        id: `r${i}`,
        panelId: `P${i}`,
        thicknessMm,
        angleDeg: 0,
        flip: flags[i % flags.length]![0],
        mirror: flags[i % flags.length]![1],
        trimMm,
      })),
    }),
  )

describe('persist round-trip', () => {
  it('serialize then parse returns an equivalent document', () => {
    fc.assert(
      fc.property(designArb, (d) => {
        expect(deserializeDesign(serializeDesign(d))).toEqual(d)
      }),
      { numRuns: 200 },
    )
  })

  it('hash encode then decode returns an equivalent document', () => {
    fc.assert(
      fc.property(designArb, (d) => {
        expect(decodeDesignFromHash(encodeDesignToHash(d))).toEqual(d)
      }),
      { numRuns: 200 },
    )
  })
})

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

/** Панель Q из полос + панель P со SliceRef на Q под произвольным углом и флипом. */
const angledDesignArb: fc.Arbitrary<Design> = fc
  .record({
    innerSpecies: fc.array(speciesArb, { minLength: 1, maxLength: 5 }),
    innerWidthMm: fc.double({ min: 4, max: 30, noNaN: true, noDefaultInfinity: true }),
    thicknessMm: fc.double({ min: 10, max: 40, noNaN: true, noDefaultInfinity: true }),
    angleDeg: fc.double({ min: -55, max: 55, noNaN: true, noDefaultInfinity: true }),
    offsetMm: fc.double({ min: -50, max: 50, noNaN: true, noDefaultInfinity: true }),
    flip: fc.boolean(),
    rowThicknessMm: fc.double({ min: 10, max: 60, noNaN: true, noDefaultInfinity: true }),
    trimMm: fc.double({ min: 0, max: 15, noNaN: true, noDefaultInfinity: true }),
  })
  .map(({ innerSpecies, innerWidthMm, thicknessMm, angleDeg, offsetMm, flip, rowThicknessMm, trimMm }) =>
    baseDesign({
      species: ['walnut', 'maple', 'cherry', 'padauk', 'wenge'],
      panels: [
        {
          id: 'Q',
          elements: innerSpecies.map((speciesId) => ({ kind: 'strip' as const, speciesId, widthMm: innerWidthMm })),
        },
        // «+ 0» гасит -0: JSON округляет его к 0, а строгое сравнение объектов - нет.
        { id: 'P', elements: [{ kind: 'sliceRef', panelId: 'Q', thicknessMm, angleDeg: angleDeg + 0, offsetMm: offsetMm + 0, flip }] },
      ],
      rows: [{ id: 'r1', panelId: 'P', thicknessMm: rowThicknessMm, angleDeg: 0, flip: false, mirror: false, trimMm }],
    }),
  )

describe('persist round-trip: угловые срезы', () => {
  it('serialize then parse сохраняет угол и флип SliceRef', () => {
    fc.assert(
      fc.property(angledDesignArb, (d) => {
        expect(deserializeDesign(serializeDesign(d))).toEqual(d)
      }),
      { numRuns: 200 },
    )
  })

  it('hash encode then decode сохраняет угол и флип SliceRef', () => {
    fc.assert(
      fc.property(angledDesignArb, (d) => {
        expect(decodeDesignFromHash(encodeDesignToHash(d))).toEqual(d)
      }),
      { numRuns: 200 },
    )
  })
})

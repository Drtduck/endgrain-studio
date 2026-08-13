import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { CONSENT_VERSION, type ConsentDecision, isDecisionValidFor, parseConsent, serializeConsent } from './cookie'

const decision: ConsentDecision = { analytics: true, regime: 'opt-in', source: 'banner', at: 1755043200 }

describe('serializeConsent / parseConsent', () => {
  it('делает round-trip', () => {
    const serialized = serializeConsent(decision)
    expect(serialized).toBe('1.1.opt-in.banner.1755043200')
    expect(parseConsent(serialized)).toEqual(decision)
  })

  it('парсит denied', () => {
    const serialized = serializeConsent({ ...decision, analytics: false, source: 'gpc' })
    expect(parseConsent(serialized)).toEqual({ ...decision, analytics: false, source: 'gpc' })
  })

  it('мусор, пустая строка и лишние/недостающие сегменты дают null', () => {
    expect(parseConsent(undefined)).toBeNull()
    expect(parseConsent(null)).toBeNull()
    expect(parseConsent('')).toBeNull()
    expect(parseConsent('garbage')).toBeNull()
    expect(parseConsent('1.1.opt-in.banner')).toBeNull()
    expect(parseConsent('1.1.opt-in.banner.123.extra')).toBeNull()
  })

  it('нечисловая метка времени даёт null', () => {
    expect(parseConsent('1.1.opt-in.banner.notanumber')).toBeNull()
  })

  it('чужая версия даёт null', () => {
    expect(parseConsent('2.1.opt-in.banner.1755043200')).toBeNull()
    expect(parseConsent('0.1.opt-in.banner.1755043200')).toBeNull()
  })

  it('неизвестный regime или source дают null', () => {
    expect(parseConsent('1.1.unknown.banner.1755043200')).toBeNull()
    expect(parseConsent('1.1.opt-in.unknown.1755043200')).toBeNull()
  })

  it('property: любое сериализованное решение парсится обратно в равное', () => {
    fc.assert(
      fc.property(
        fc.record({
          analytics: fc.boolean(),
          regime: fc.constantFrom('opt-in', 'opt-out') as fc.Arbitrary<ConsentDecision['regime']>,
          source: fc.constantFrom('banner', 'gpc', 'settings') as fc.Arbitrary<ConsentDecision['source']>,
          at: fc.integer({ min: 0, max: 4_000_000_000 }),
        }),
        (d) => {
          expect(parseConsent(serializeConsent(d))).toEqual(d)
        }
      )
    )
  })
})

describe('isDecisionValidFor', () => {
  it('null решение невалидно всегда', () => {
    expect(isDecisionValidFor(null, 'opt-in')).toBe(false)
    expect(isDecisionValidFor(null, 'opt-out')).toBe(false)
  })

  it('granted из opt-out невалиден при переезде в opt-in', () => {
    const d: ConsentDecision = { analytics: true, regime: 'opt-out', source: 'banner', at: 1 }
    expect(isDecisionValidFor(d, 'opt-in')).toBe(false)
    expect(isDecisionValidFor(d, 'opt-out')).toBe(true)
  })

  it('granted из opt-in остаётся валидным при переезде в opt-out', () => {
    const d: ConsentDecision = { analytics: true, regime: 'opt-in', source: 'banner', at: 1 }
    expect(isDecisionValidFor(d, 'opt-out')).toBe(true)
    expect(isDecisionValidFor(d, 'opt-in')).toBe(true)
  })

  it('denied валиден всегда', () => {
    const d: ConsentDecision = { analytics: false, regime: 'opt-in', source: 'banner', at: 1 }
    expect(isDecisionValidFor(d, 'opt-in')).toBe(true)
    expect(isDecisionValidFor(d, 'opt-out')).toBe(true)
  })

  it('версия используется в сериализации', () => {
    expect(CONSENT_VERSION).toBe(1)
  })
})

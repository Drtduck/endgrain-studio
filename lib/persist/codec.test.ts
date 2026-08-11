import { describe, it, expect, beforeEach } from 'vitest'
import { baseDesign, stripsPanel, type Design } from '@/lib/engine'
import { parseDesign, migrate, CURRENT_SCHEMA_VERSION } from './schema'
import {
  LS_CURRENT_KEY,
  decodeDesignFromHash,
  deserializeDesign,
  encodeDesignToHash,
  loadFromLocalStorage,
  saveToLocalStorage,
  serializeDesign,
  toCompact,
} from './codec'

const nested: Design = baseDesign({
  panels: [
    stripsPanel('Q', ['walnut', 'maple'], 12),
    { id: 'P', elements: [{ kind: 'sliceRef', panelId: 'Q', thicknessMm: 24, angleDeg: 0, offsetMm: 6 }] },
  ],
  rows: [{ id: 'r1', panelId: 'P', thicknessMm: 30, angleDeg: 0, flip: true, mirror: false, trimMm: 5 }],
})

describe('codec', () => {
  it('round-trips a design through JSON', () => {
    expect(deserializeDesign(serializeDesign(nested))).toEqual(nested)
  })

  it('round-trips a design through the URL hash', () => {
    const hash = encodeDesignToHash(nested)
    expect(hash).not.toContain('{')
    expect(decodeDesignFromHash(hash)).toEqual(nested)
  })

  it('produces a compact positional form', () => {
    const c = toCompact(nested) as Record<string, unknown>
    expect(c['v']).toBe(CURRENT_SCHEMA_VERSION)
    expect(c['s']).toEqual(['walnut', 'maple'])
    expect(c['p']).toEqual([
      ['Q', [0, 0, 12], [0, 1, 12]],
      ['P', [1, 0, 24, 0, 6]],
    ])
    expect(c['r']).toEqual([['r1', 1, 30, 0, 1, 5]])
  })

  it('keeps a typical share link under 2 kilobytes', () => {
    const big = baseDesign({
      panels: Array.from({ length: 8 }, (_, i) => stripsPanel(`P${i}`, Array(12).fill('walnut'), 20)),
      rows: Array.from({ length: 12 }, (_, i) => ({
        id: `r${i}`, panelId: `P${i % 8}`, thicknessMm: 25, angleDeg: 0, flip: false, mirror: i % 2 === 1, trimMm: 4,
      })),
    })
    expect(encodeDesignToHash(big).length).toBeLessThan(2048)
  })

  it('appends species used by strips but missing from design.species instead of preserving the palette verbatim', () => {
    const withGap = baseDesign({
      species: ['maple'],
      panels: [stripsPanel('A', ['maple', 'walnut'], 25)],
      rows: [{ id: 'r1', panelId: 'A', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 }],
    })

    const c = toCompact(withGap) as Record<string, unknown>
    expect(c['s']).toEqual(['maple', 'walnut'])

    const roundTripped = deserializeDesign(serializeDesign(withGap))
    expect(roundTripped.species).toEqual(['maple', 'walnut'])
    expect(roundTripped).not.toEqual(withGap) // палитра нормализуется, а не переносится дословно
  })

  it('rejects a malformed document', () => {
    expect(() => parseDesign({ schemaVersion: 1, id: 'x' })).toThrow()
    expect(() => decodeDesignFromHash('не-сжатая-строка')).toThrow()
  })
})

describe('migrations', () => {
  it('upgrades a version-0 document by filling the new fields', () => {
    const legacy = { ...baseDesign(), schemaVersion: undefined, planerWidthMm: undefined }
    const migrated = migrate(legacy) as Record<string, unknown>
    expect(migrated['schemaVersion']).toBe(1)
    expect(migrated['planerWidthMm']).toBe(330)
    expect(() => parseDesign(legacy)).not.toThrow()
  })
})

describe('localStorage', () => {
  beforeEach(() => window.localStorage.clear())

  it('saves and loads the current design', () => {
    expect(loadFromLocalStorage()).toBeNull()
    saveToLocalStorage(nested)
    expect(window.localStorage.getItem(LS_CURRENT_KEY)).toBeTruthy()
    expect(loadFromLocalStorage()).toEqual(nested)
  })

  it('returns null instead of throwing on corrupted storage', () => {
    window.localStorage.setItem(LS_CURRENT_KEY, 'мусор')
    expect(loadFromLocalStorage()).toBeNull()
  })
})

import { describe, it, expect } from 'vitest'
import { baseDesign, stripsPanel, validate, type Diagnostic } from '@/lib/engine'
import { shrinkageMap } from '@/lib/species'
import { diagnosticText, localizeDiagnosticParams } from './diagnostics'

const shrinkageDesign = baseDesign({
  species: ['cherry', 'maple'],
  panels: [stripsPanel('A', ['cherry', 'maple']), stripsPanel('B', ['maple', 'cherry'])],
})

function find(code: string): Diagnostic {
  const d = validate(shrinkageDesign, { shrinkageByPct: shrinkageMap() }).find((x) => x.code === code)
  if (!d) throw new Error(`диагностика ${code} не найдена`)
  return d
}

describe('localizeDiagnosticParams', () => {
  it('подменяет id пород на локализованные названия со строчной буквы', () => {
    const params = localizeDiagnosticParams({ a: 'cherry', b: 'maple', deltaPp: 2.8 }, 'ru')
    expect(params.a).toBe('вишня')
    expect(params.b).toBe('клён')
    expect(params.deltaPp).toBe(2.8)
  })

  it('оставляет неизвестный id как есть', () => {
    expect(localizeDiagnosticParams({ speciesId: 'unobtainium' }, 'ru').speciesId).toBe('unobtainium')
  })

  it('не трогает параметры, которые породами не являются', () => {
    expect(localizeDiagnosticParams({ panelId: 'A', widthMm: 3 }, 'ru')).toEqual({ panelId: 'A', widthMm: 3 })
  })
})

describe('diagnosticText', () => {
  it('печатает породы по-русски, а не ключами справочника', () => {
    const text = diagnosticText(find('SHRINKAGE_MISMATCH'), 'ru')
    expect(text).toContain('вишня')
    expect(text).toContain('клён')
    expect(text).not.toContain('cherry')
    expect(text).not.toContain('maple')
  })

  it('печатает породы по-английски', () => {
    const text = diagnosticText(find('SHRINKAGE_MISMATCH'), 'en')
    expect(text).toContain('cherry')
    expect(text).toContain('hard maple')
  })

  it('локализует породу в UNKNOWN_SPECIES', () => {
    const design = baseDesign({
      species: ['walnut'],
      panels: [stripsPanel('A', ['walnut', 'unobtainium']), stripsPanel('B', ['walnut'])],
    })
    const unknown = validate(design, { knownSpeciesIds: ['walnut'] }).find((d) => d.code === 'UNKNOWN_SPECIES')
    expect(unknown).toBeDefined()
    expect(diagnosticText(unknown!, 'ru')).toContain('unobtainium')

    const known = validate(design, { knownSpeciesIds: [] }).find((d) => d.code === 'UNKNOWN_SPECIES')
    expect(diagnosticText(known!, 'ru')).toContain('орех')
  })

  it('не оставляет неподставленных плейсхолдеров', () => {
    for (const locale of ['ru', 'en'] as const) {
      expect(diagnosticText(find('SHRINKAGE_MISMATCH'), locale)).not.toMatch(/\{[a-zA-Z]+\}/)
    }
  })
})

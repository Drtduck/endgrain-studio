import { describe, it, expect } from 'vitest'
import { compile } from '@/lib/engine'
import { baseDesign } from '@/lib/engine/fixtures'
import { buildSummary, parseSummary } from './summary'

describe('buildSummary', () => {
  it('сводка совпадает с compile на фикстуре baseDesign', () => {
    const design = baseDesign()
    const model = compile(design)
    const summary = buildSummary(model)

    expect(summary.widthMm).toBe(Math.round(model.widthMm))
    expect(summary.lengthMm).toBe(Math.round(model.lengthMm))
    expect(summary.thicknessMm).toBe(Math.round(model.thicknessMm))
    expect(summary.cellCount).toBe(model.cells.length)
    expect(summary.species.length).toBeGreaterThan(0)
  })

  it('главная порода первая по площади', () => {
    const summary = buildSummary(compile(baseDesign()))
    const uniqueSpecies = new Set(summary.species)
    expect(uniqueSpecies.size).toBe(summary.species.length)
  })
})

describe('parseSummary', () => {
  it('разбирает валидную сводку', () => {
    const summary = buildSummary(compile(baseDesign()))
    expect(parseSummary(summary)).toEqual(summary)
  })

  it('битый design отбивается', () => {
    expect(parseSummary(null)).toBeNull()
    expect(parseSummary({})).toBeNull()
    expect(parseSummary({ widthMm: 'not a number' })).toBeNull()
    expect(parseSummary({ widthMm: -5, lengthMm: 10, thicknessMm: 10, cellCount: 1, species: [] })).toBeNull()
  })
})

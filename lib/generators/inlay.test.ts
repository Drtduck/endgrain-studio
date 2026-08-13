import { describe, it, expect } from 'vitest'
import { MIN_STRIP_WIDTH_MM, compile, hasErrors, panelWidthMm, validate } from '@/lib/engine'
import { SPECIES, shrinkageMap } from '@/lib/species'
import { randomGenome } from './genome'
import { inlayDesign } from './inlay'

const KNOWN = SPECIES.map((s) => s.id)
const SHRINK = shrinkageMap()

describe('inlayDesign', () => {
  it('строит ровно две панели: наружную и вставку', () => {
    const design = inlayDesign(randomGenome('inlay', 1))
    expect(design.panels).toHaveLength(2)
  })

  it('вставка сделана срезом другой панели, глубина ровно два', () => {
    const design = inlayDesign(randomGenome('inlay', 2))
    const outer = design.panels.find((p) => p.elements.some((el) => el.kind === 'sliceRef'))
    expect(outer).toBeDefined()
    const refs = outer?.elements.filter((el) => el.kind === 'sliceRef') ?? []
    expect(refs).toHaveLength(1)
    const inner = design.panels.find((p) => p.id === (refs[0]?.kind === 'sliceRef' ? refs[0].panelId : ''))
    expect(inner).toBeDefined()
    expect(inner?.elements.every((el) => el.kind === 'strip')).toBe(true)
  })

  it('все ряды смотрят в наружную панель, поэтому доска не рваная', () => {
    const design = inlayDesign(randomGenome('inlay', 3))
    expect(new Set(design.rows.map((r) => r.panelId)).size).toBe(1)
  })

  it('угол реза везде нулевой', () => {
    const design = inlayDesign(randomGenome('inlay', 4))
    for (const row of design.rows) expect(row.angleDeg).toBe(0)
    for (const panel of design.panels) {
      for (const el of panel.elements) if (el.kind === 'sliceRef') expect(el.angleDeg).toBe(0)
    }
  })

  it('обе панели влезают в рейсмус, полосы не тоньше минимума', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const design = inlayDesign(randomGenome('inlay', seed))
      for (const panel of design.panels) {
        expect(panelWidthMm(panel)).toBeLessThanOrEqual(design.planerWidthMm)
        for (const el of panel.elements) {
          const extent = el.kind === 'strip' ? el.widthMm : el.thicknessMm
          expect(extent).toBeGreaterThanOrEqual(MIN_STRIP_WIDTH_MM)
        }
      }
    }
  })

  it('на ста сидах проходит проверки изготовимости без ошибок', () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const design = inlayDesign(randomGenome('inlay', seed))
      const diagnostics = validate(design, { shrinkageByPct: SHRINK, knownSpeciesIds: KNOWN })
      expect(hasErrors(diagnostics), `сид ${seed}: ${JSON.stringify(diagnostics.filter((d) => d.level === 'error'))}`).toBe(false)
    }
  })

  it('внутри полосы вставки мельче наружных, ради чего всё и затевалось', () => {
    const design = inlayDesign(randomGenome('inlay', 8))
    const model = compile(design)
    expect(model.cells.length).toBeGreaterThan(design.rows.length * 5)
  })

  it('перечисляет в палитре проекта все использованные породы', () => {
    const design = inlayDesign(randomGenome('inlay', 9))
    const used = new Set<string>()
    for (const panel of design.panels) for (const el of panel.elements) if (el.kind === 'strip') used.add(el.speciesId)
    for (const id of used) expect(design.species).toContain(id)
  })
})

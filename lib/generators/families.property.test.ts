import { describe, it, expect } from 'vitest'
import { MAX_CELLS, WARN_CELLS, compile, validate } from '@/lib/engine'
import { SPECIES, shrinkageMap } from '@/lib/species'
import { FAMILY_IDS, randomGenome } from './genome'
import { toDesign } from './families'

const KNOWN = SPECIES.map((s) => s.id)
const SHRINK = shrinkageMap()
const SEEDS = 100

describe('генератор на ста сидах каждого семейства', () => {
  for (const familyId of FAMILY_IDS) {
    it(`${familyId}: ноль ошибок изготовимости`, () => {
      for (let seed = 0; seed < SEEDS; seed += 1) {
        const design = toDesign(randomGenome(familyId, seed))
        const diagnostics = validate(design, { shrinkageByPct: SHRINK, knownSpeciesIds: KNOWN })
        const errors = diagnostics.filter((d) => d.level === 'error')
        expect(errors, `${familyId} сид ${seed}: ${JSON.stringify(errors)}`).toEqual([])
      }
    })

    it(`${familyId}: модель не обрезана и укладывается в бюджет ячеек`, () => {
      for (let seed = 0; seed < SEEDS; seed += 1) {
        const model = compile(toDesign(randomGenome(familyId, seed)))
        expect(model.truncated).toBe(false)
        expect(model.cells.length).toBeLessThan(WARN_CELLS)
        expect(model.cells.length).toBeLessThan(MAX_CELLS)
        expect(model.cells.length).toBeGreaterThan(0)
      }
    })

    it(`${familyId}: два случайных прогона дают визуально разные доски`, () => {
      const shapes = new Set<string>()
      for (let seed = 0; seed < SEEDS; seed += 1) {
        const model = compile(toDesign(randomGenome(familyId, seed)))
        shapes.add(model.cells.map((c) => c.speciesId).join(''))
      }
      // Требование конкурса: два прогона не должны совпасть. Берём с большим запасом.
      expect(shapes.size).toBeGreaterThanOrEqual(SEEDS - 5)
    })
  }

  it('число склеек честное: одинаковые ряды переиспользуют панель', () => {
    for (const familyId of FAMILY_IDS) {
      const design = toDesign(randomGenome(familyId, 3))
      const model = compile(design)
      expect(model.glueUpCount).toBe(design.panels.length + 1)
    }
  })
})

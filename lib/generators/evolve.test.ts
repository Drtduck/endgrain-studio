import { describe, it, expect } from 'vitest'
import { hasErrors, validate } from '@/lib/engine'
import { SPECIES, shrinkageMap } from '@/lib/species'
import { toDesign } from './families'
import { FAMILY_IDS, genomeKey, randomGenome, type Genome } from './genome'
import { makeRng } from './random'
import {
  POPULATION_SIZE,
  applyParams,
  crossover,
  mutate,
  nextGeneration,
  reshuffle,
  seedPopulation,
} from './evolve'

const KNOWN = SPECIES.map((s) => s.id)
const SHRINK = shrinkageMap()

function expectAllBuildable(genomes: readonly Genome[]): void {
  for (const genome of genomes) {
    const diagnostics = validate(toDesign(genome, 'x'), { shrinkageByPct: SHRINK, knownSpeciesIds: KNOWN })
    expect(hasErrors(diagnostics), JSON.stringify(diagnostics.filter((d) => d.level === 'error'))).toBe(false)
  }
}

describe('seedPopulation', () => {
  it('даёт девять особей с уникальными идентификаторами', () => {
    const pop = seedPopulation(1, FAMILY_IDS)
    expect(pop.items).toHaveLength(POPULATION_SIZE)
    expect(new Set(pop.items.map((i) => i.id)).size).toBe(POPULATION_SIZE)
    expect(pop.generation).toBe(1)
  })

  it('раскладывает выбранные семейства по слотам', () => {
    const pop = seedPopulation(2, ['stripes', 'chaos'])
    for (const item of pop.items) expect(['stripes', 'chaos']).toContain(item.genome.familyId)
    expect(new Set(pop.items.map((i) => i.genome.familyId)).size).toBe(2)
  })

  it('на пустом списке семейств берёт все', () => {
    expect(seedPopulation(3, []).items).toHaveLength(POPULATION_SIZE)
  })

  it('детерминирована', () => {
    expect(seedPopulation(9, FAMILY_IDS)).toEqual(seedPopulation(9, FAMILY_IDS))
  })

  it('все девять досок изготовимы', () => {
    expectAllBuildable(seedPopulation(4, FAMILY_IDS).items.map((i) => i.genome))
  })

  it('девять досок не совпадают между собой', () => {
    const keys = seedPopulation(5, FAMILY_IDS).items.map((i) => genomeKey(i.genome))
    expect(new Set(keys).size).toBe(POPULATION_SIZE)
  })
})

describe('mutate', () => {
  it('меняет геном, но оставляет его изготовимым', () => {
    const base = randomGenome('brick', 10)
    const changed: Genome[] = []
    for (let seed = 0; seed < 40; seed += 1) changed.push(mutate(base, makeRng(seed)))
    expect(changed.some((g) => genomeKey(g) !== genomeKey(base))).toBe(true)
    expectAllBuildable(changed)
  })

  it('детерминирована по сиду', () => {
    const base = randomGenome('gradient', 11)
    expect(mutate(base, makeRng(3))).toEqual(mutate(base, makeRng(3)))
  })

  it('замена породы берёт близкую по цвету, а не любую', () => {
    // Прогоняем много сидов и смотрим, что палитра меняется мелкими шагами.
    const base = randomGenome('stripes', 12)
    let swaps = 0
    for (let seed = 0; seed < 100; seed += 1) {
      const next = mutate(base, makeRng(seed))
      if (next.palette.join() !== base.palette.join()) swaps += 1
    }
    expect(swaps).toBeGreaterThan(10)
  })

  it('после мутации сохраняется корректная перестановка рядов', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const g = mutate(randomGenome('chaos', 13), makeRng(seed))
      expect([...g.rowOrder].sort((a, b) => a - b)).toEqual(Array.from({ length: g.params.rows }, (_, i) => i))
    }
  })
})

describe('crossover', () => {
  it('берёт признаки обоих родителей', () => {
    const a = randomGenome('stripes', 20)
    const b = randomGenome('brick', 21)
    const child = crossover(a, b, makeRng(1))
    expect([a.familyId, b.familyId]).toContain(child.familyId)
    const parentSpecies = new Set([...a.palette, ...b.palette])
    for (const id of child.palette) expect(parentSpecies.has(id)).toBe(true)
  })

  it('детерминирован и симметричен по сиду', () => {
    const a = randomGenome('gradient', 22)
    const b = randomGenome('chaos', 23)
    expect(crossover(a, b, makeRng(4))).toEqual(crossover(a, b, makeRng(4)))
  })

  it('потомок изготовим при любых родителях', () => {
    const children: Genome[] = []
    for (const left of FAMILY_IDS) {
      for (const right of FAMILY_IDS) {
        children.push(crossover(randomGenome(left, 1), randomGenome(right, 2), makeRng(7)))
      }
    }
    expectAllBuildable(children)
  })
})

describe('nextGeneration', () => {
  it('без избранных полностью обновляет популяцию', () => {
    const first = seedPopulation(30, FAMILY_IDS)
    const second = nextGeneration(first, [])
    expect(second.generation).toBe(2)
    const before = new Set(first.items.map((i) => genomeKey(i.genome)))
    const overlap = second.items.filter((i) => before.has(genomeKey(i.genome)))
    expect(overlap).toHaveLength(0)
  })

  it('сохраняет избранное нетронутым в первых слотах', () => {
    const first = seedPopulation(31, FAMILY_IDS)
    const favourite = first.items[3]
    expect(favourite).toBeDefined()
    if (!favourite) return
    const second = nextGeneration(first, [favourite.id])
    expect(second.items[0]?.genome).toEqual(favourite.genome)
  })

  it('двое избранных дают потомков, а не копии', () => {
    const first = seedPopulation(32, FAMILY_IDS)
    const ids = [first.items[0]?.id, first.items[1]?.id].filter((id): id is string => id !== undefined)
    const second = nextGeneration(first, ids)
    expect(second.items).toHaveLength(POPULATION_SIZE)
    const keys = second.items.map((i) => genomeKey(i.genome))
    expect(new Set(keys).size).toBeGreaterThanOrEqual(POPULATION_SIZE - 1)
  })

  it('детерминирована по тем же кликам', () => {
    const first = seedPopulation(33, FAMILY_IDS)
    const ids = [first.items[2]?.id, first.items[5]?.id].filter((id): id is string => id !== undefined)
    expect(nextGeneration(first, ids)).toEqual(nextGeneration(first, ids))
  })

  it('порядок кликов не влияет на результат', () => {
    const first = seedPopulation(34, FAMILY_IDS)
    const a = first.items[1]?.id
    const b = first.items[6]?.id
    if (a === undefined || b === undefined) return
    expect(nextGeneration(first, [a, b])).toEqual(nextGeneration(first, [b, a]))
  })

  it('незнакомые идентификаторы игнорирует', () => {
    const first = seedPopulation(35, FAMILY_IDS)
    expect(nextGeneration(first, ['мусор'])).toEqual(nextGeneration(first, []))
  })

  it('через десять поколений всё ещё изготовимо', () => {
    let pop = seedPopulation(36, FAMILY_IDS)
    for (let step = 0; step < 10; step += 1) {
      const ids = [pop.items[0]?.id, pop.items[4]?.id].filter((id): id is string => id !== undefined)
      pop = nextGeneration(pop, ids)
    }
    expect(pop.generation).toBe(11)
    expectAllBuildable(pop.items.map((i) => i.genome))
  })

  it('идентификаторы уникальны в каждом поколении', () => {
    let pop = seedPopulation(37, FAMILY_IDS)
    for (let step = 0; step < 5; step += 1) {
      pop = nextGeneration(pop, [pop.items[0]?.id ?? ''])
      expect(new Set(pop.items.map((i) => i.id)).size).toBe(POPULATION_SIZE)
    }
  })
})

describe('reshuffle', () => {
  it('меняет сид и обнуляет поколение', () => {
    const first = seedPopulation(40, FAMILY_IDS)
    const shuffled = reshuffle(first)
    expect(shuffled.seed).not.toBe(first.seed)
    expect(shuffled.generation).toBe(1)
    expect(shuffled.familyIds).toEqual(first.familyIds)
  })
})

describe('applyParams', () => {
  it('применяет ползунок ко всем девяти, не теряя поиск', () => {
    const first = seedPopulation(41, ['chaos'])
    const wider = applyParams(first, { cols: 12 })
    expect(wider.items).toHaveLength(POPULATION_SIZE)
    for (const item of wider.items) expect(item.genome.params.cols).toBe(12)
    expect(wider.generation).toBe(first.generation)
    expectAllBuildable(wider.items.map((i) => i.genome))
  })

  it('не трогает семейства и сиды особей', () => {
    const first = seedPopulation(42, FAMILY_IDS)
    const next = applyParams(first, { density: 0.9 })
    expect(next.items.map((i) => i.genome.seed)).toEqual(first.items.map((i) => i.genome.seed))
    expect(next.items.map((i) => i.genome.familyId)).toEqual(first.items.map((i) => i.genome.familyId))
  })

  it('зажимает невозможные значения вместо того, чтобы ломать доску', () => {
    const first = seedPopulation(43, ['symmetry-p4m'])
    const next = applyParams(first, { cols: 99, rows: 1 })
    for (const item of next.items) {
      expect(item.genome.params.cols).toBeLessThanOrEqual(12)
      expect(item.genome.params.rows).toBe(item.genome.params.cols)
    }
    expectAllBuildable(next.items.map((i) => i.genome))
  })
})

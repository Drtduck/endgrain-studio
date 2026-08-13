import type { SpeciesId } from '@/lib/engine'
import { speciesNeighbours } from '@/lib/species/lab'
import { roundHalf } from '@/lib/designs/fit'
import {
  FAMILY_IDS,
  clampGenome,
  randomGenome,
  type FamilyId,
  type GenParams,
  type Genome,
} from './genome'
import { sanitisePalette } from './palette'
import { makeRng, mixSeed, type Rng } from './random'

export const POPULATION_SIZE = 9

export interface Individual {
  readonly id: string
  readonly genome: Genome
}

export interface Population {
  readonly seed: number
  readonly generation: number
  readonly familyIds: readonly FamilyId[]
  readonly items: readonly Individual[]
}

function idFor(generation: number, index: number): string {
  return `g${generation}i${index}`
}

function familiesOf(familyIds: readonly FamilyId[]): readonly FamilyId[] {
  const filtered = familyIds.filter((id) => FAMILY_IDS.includes(id))
  return filtered.length > 0 ? filtered : FAMILY_IDS
}

/** Свежая девятка: семейства раскладываются по кругу, сид каждой особи выводится из сида популяции. */
export function seedPopulation(seed: number, familyIds: readonly FamilyId[]): Population {
  const families = familiesOf(familyIds)
  const base = Math.abs(Math.trunc(seed)) >>> 0
  const items = Array.from({ length: POPULATION_SIZE }, (_, index) => {
    const familyId = families[index % families.length] ?? 'stripes'
    return { id: idFor(1, index), genome: randomGenome(familyId, mixSeed(base, index)) }
  })
  return { seed: base, generation: 1, familyIds: families, items }
}

export function reshuffle(population: Population): Population {
  return seedPopulation(mixSeed(population.seed, population.generation + 0x77), population.familyIds)
}

type MutationKind = 'species' | 'widths' | 'rows' | 'grid' | 'seed' | 'paletteSize' | 'angle'
const MUTATIONS: readonly MutationKind[] = ['species', 'widths', 'rows', 'grid', 'seed', 'paletteSize', 'angle']

function mutateOnce(genome: Genome, kind: MutationKind, rng: Rng): Genome {
  if (kind === 'species') {
    // Порода меняется на близкую по LAB: узор узнаётся, но настроение сдвигается.
    const index = rng.int(genome.palette.length)
    const current = genome.palette[index]
    if (current === undefined) return genome
    const neighbours = speciesNeighbours(current, 4).filter((id) => !genome.palette.includes(id))
    if (neighbours.length === 0) return genome
    const palette: SpeciesId[] = [...genome.palette]
    palette[index] = rng.pick(neighbours)
    return { ...genome, palette }
  }
  if (kind === 'widths') {
    const amount = 0.2
    return {
      ...genome,
      colWidthsMm: genome.colWidthsMm.map((w) => roundHalf(w * (1 + (rng.next() * 2 - 1) * amount))),
      rowHeightsMm: genome.rowHeightsMm.map((h) => roundHalf(h * (1 + (rng.next() * 2 - 1) * amount))),
    }
  }
  if (kind === 'rows') {
    return { ...genome, rowOrder: rng.shuffled(genome.rowOrder) }
  }
  if (kind === 'grid') {
    const delta = rng.bool() ? 1 : -1
    return {
      ...genome,
      params: { ...genome.params, cols: genome.params.cols + delta, rows: genome.params.rows + (rng.bool() ? delta : 0) },
    }
  }
  if (kind === 'seed') {
    return { ...genome, seed: mixSeed(genome.seed, rng.int(1024) + 1) }
  }
  if (kind === 'angle') {
    // Нерелевантным семействам (без хинта угла) clampGenome всё равно занулит правку.
    const deltaDeg = (rng.next() * 2 - 1) * 8
    return { ...genome, params: { ...genome.params, angleDeg: genome.params.angleDeg + deltaDeg } }
  }
  const size = genome.palette.length + (rng.bool() ? 1 : -1)
  return { ...genome, palette: sanitisePalette(genome.palette, genome.seed, size) }
}

/** Одна или две случайные правки генома. Больше двух за раз - и родство с оригиналом теряется. */
export function mutate(genome: Genome, rng: Rng): Genome {
  let out = genome
  const count = rng.bool(0.35) ? 2 : 1
  for (let step = 0; step < count; step += 1) out = mutateOnce(out, rng.pick(MUTATIONS), rng)
  return clampGenome(out)
}

function blend(a: number, b: number, takeA: boolean): number {
  return takeA ? a : b
}

/**
 * Скрещивание: ширины от одного родителя, ряды от другого, палитра вперемешку.
 * Одноточечный разрез по спискам рядов даёт потомку узнаваемую половину каждого родителя.
 */
export function crossover(a: Genome, b: Genome, rng: Rng): Genome {
  const familyId = rng.bool() ? a.familyId : b.familyId
  const cut = 1 + rng.int(Math.max(1, Math.min(a.rowHeightsMm.length, b.rowHeightsMm.length) - 1))
  const rowHeightsMm = [...a.rowHeightsMm.slice(0, cut), ...b.rowHeightsMm.slice(cut)]
  const rowOrder = [...a.rowOrder.slice(0, cut), ...b.rowOrder.slice(cut)]

  const mixedPalette: SpeciesId[] = []
  const longer = Math.max(a.palette.length, b.palette.length)
  for (let i = 0; i < longer; i += 1) {
    const first = rng.bool() ? a.palette[i] : b.palette[i]
    const second = first === a.palette[i] ? b.palette[i] : a.palette[i]
    const chosen = first ?? second
    if (chosen !== undefined && !mixedPalette.includes(chosen)) mixedPalette.push(chosen)
  }

  const takeA = rng.bool()
  const params: GenParams = {
    cols: blend(a.params.cols, b.params.cols, takeA),
    rows: blend(a.params.rows, b.params.rows, !takeA),
    cellMm: roundHalf((a.params.cellMm + b.params.cellMm) / 2),
    density: (a.params.density + b.params.density) / 2,
    jitter: (a.params.jitter + b.params.jitter) / 2,
    angleDeg: (a.params.angleDeg + b.params.angleDeg) / 2,
  }

  return clampGenome({
    familyId,
    seed: mixSeed(a.seed, b.seed),
    palette: mixedPalette,
    colWidthsMm: takeA ? [...a.colWidthsMm] : [...b.colWidthsMm],
    rowHeightsMm,
    rowOrder,
    params,
  })
}

/**
 * Следующее поколение. Пользователь и есть функция приспособленности: никакого скоринга
 * контраста и симметрии здесь нет и не будет, звёздочки решают всё.
 */
export function nextGeneration(population: Population, favouriteIds: readonly string[]): Population {
  const generation = population.generation + 1
  const chosen = population.items.filter((item) => favouriteIds.includes(item.id))
  const families = familiesOf(population.familyIds)
  // Сид зависит от выбора, но не от порядка кликов: одни и те же звёздочки дают ту же девятку.
  const choiceSalt = chosen.reduce((acc, item) => acc ^ Number.parseInt(item.id.replace(/\D/g, ''), 10), 0)
  const seed = mixSeed(mixSeed(population.seed, generation), choiceSalt)

  if (chosen.length === 0) {
    const fresh = seedPopulation(seed, families)
    return {
      seed: population.seed,
      generation,
      familyIds: families,
      items: fresh.items.map((item, index) => ({ id: idFor(generation, index), genome: item.genome })),
    }
  }

  const rng = makeRng(seed)
  const items: Individual[] = chosen
    .slice(0, POPULATION_SIZE - 1)
    .map((item, index) => ({ id: idFor(generation, index), genome: item.genome }))

  while (items.length < POPULATION_SIZE - 1) {
    const index = items.length
    const parentA = rng.pick(chosen).genome
    const genome =
      chosen.length >= 2 && rng.bool(0.5)
        ? crossover(parentA, rng.pick(chosen).genome, rng)
        : mutate(parentA, rng)
    items.push({ id: idFor(generation, index), genome })
  }

  // Последний слот всегда чужак: без притока свежей крови девятка схлопывается за пять поколений.
  const immigrantFamily = families[rng.int(families.length)] ?? 'stripes'
  items.push({ id: idFor(generation, POPULATION_SIZE - 1), genome: randomGenome(immigrantFamily, mixSeed(seed, 0xbeef)) })

  return { seed: population.seed, generation, familyIds: families, items }
}

/** Ползунки в интерфейсе: правка параметров всей девятки без потери найденного. */
export function applyParams(population: Population, patch: Partial<GenParams>): Population {
  return {
    ...population,
    items: population.items.map((item) => ({
      ...item,
      genome: clampGenome({ ...item.genome, params: { ...item.genome.params, ...patch } }),
    })),
  }
}

import type { SpeciesId } from '@/lib/engine'
import { SPECIES, SPECIES_BY_ID } from '@/lib/species'
import { chroma, lightnessRamp, speciesDistance, speciesNeighbours } from '@/lib/species/lab'
import { makeRng, mixSeed, type Rng } from './random'

export type PaletteKind = 'contrast' | 'analogous' | 'accented'
export const PALETTE_KINDS: readonly PaletteKind[] = ['contrast', 'analogous', 'accented']

export const MIN_PALETTE = 2
export const MAX_PALETTE = 5
/** Ниже этого расстояния в LAB две породы на доске сливаются в одно пятно. */
export const MIN_PALETTE_DISTANCE = 18

const ALL_IDS: readonly SpeciesId[] = SPECIES.map((s) => s.id)
/** Породы, которые тянут на акцент: высокая насыщенность, а не просто тёмный тон. */
const LOUD_IDS: readonly SpeciesId[] = SPECIES.filter((s) => chroma(s.lab) > 40).map((s) => s.id)

function clampSize(size: number): number {
  if (!Number.isFinite(size)) return MIN_PALETTE
  return Math.max(MIN_PALETTE, Math.min(MAX_PALETTE, Math.round(size)))
}

/**
 * Жадный farthest-point sampling: каждая следующая порода максимально далека
 * от уже выбранных. Так контрастная палитра остаётся контрастной и на пяти породах,
 * а не вырождается в четыре оттенка коричневого.
 */
export function contrastPalette(rng: Rng, size: number): readonly SpeciesId[] {
  const count = clampSize(size)
  const out: SpeciesId[] = [rng.pick(ALL_IDS)]
  while (out.length < count) {
    const scored = ALL_IDS.filter((id) => !out.includes(id)).map((id) => {
      let nearest = Infinity
      for (const chosen of out) nearest = Math.min(nearest, speciesDistance(chosen, id))
      return { id, nearest }
    })
    if (scored.length === 0) break
    const maxNearest = Math.max(...scored.map((s) => s.nearest))
    // Жёсткий максимум даёт всего 16 стартовых развилок на 100 сидов и вырождается
    // в одинаковые доски. Берём случайного кандидата среди всех, кто не хуже порога
    // различимости: разнообразие растёт, а MIN_PALETTE_DISTANCE всё равно соблюдается,
    // когда это вообще достижимо.
    const threshold = maxNearest >= MIN_PALETTE_DISTANCE ? MIN_PALETTE_DISTANCE : maxNearest
    const pool = scored.filter((s) => s.nearest >= threshold).map((s) => s.id)
    out.push(rng.pick(pool))
  }
  return out
}

/** Тональная лесенка: окно подряд идущих ступеней прореженной лестницы по светлоте. */
export function analogousPalette(rng: Rng, size: number): readonly SpeciesId[] {
  const count = clampSize(size)
  const ramp = lightnessRamp(MIN_PALETTE_DISTANCE)
  if (ramp.length <= count) return contrastPalette(rng, count)
  const start = rng.int(ramp.length - count + 1)
  return ramp.slice(start, start + count)
}

/** Контрастная основа плюс ровно один громкий акцент: тонкий кант или полоса. */
export function accentedPalette(rng: Rng, size: number): readonly SpeciesId[] {
  const count = clampSize(size)
  const accent = LOUD_IDS.length > 0 ? rng.pick(LOUD_IDS) : rng.pick(ALL_IDS)
  const base = contrastPalette(rng, count).filter((id) => !LOUD_IDS.includes(id))
  const out: SpeciesId[] = [...base.slice(0, count - 1), accent]
  // Основа могла оказаться короче: добираем самыми далёкими от акцента спокойными породами.
  const calm = ALL_IDS.filter((id) => !LOUD_IDS.includes(id) && !out.includes(id))
    .map((id) => ({ id, d: speciesDistance(accent, id) }))
    .sort((a, b) => b.d - a.d || a.id.localeCompare(b.id))
  for (const entry of calm) {
    if (out.length >= count) break
    out.unshift(entry.id)
  }
  return out.slice(0, count)
}

export function makePalette(rng: Rng, size: number, kind?: PaletteKind): readonly SpeciesId[] {
  const chosen = kind ?? rng.pick(PALETTE_KINDS)
  if (chosen === 'analogous') return analogousPalette(rng, size)
  if (chosen === 'accented') return accentedPalette(rng, size)
  return contrastPalette(rng, size)
}

/**
 * Починка палитры после мутации и скрещивания: неизвестные породы выбрасываются,
 * дубликаты схлопываются, недостача добирается ближайшими соседями по LAB.
 * Сид фиксирован снаружи, поэтому починка детерминирована.
 */
export function sanitisePalette(ids: readonly SpeciesId[], seed: number, size: number): readonly SpeciesId[] {
  const count = clampSize(size)
  const out: SpeciesId[] = []
  for (const id of ids) {
    if (!SPECIES_BY_ID.has(id)) continue
    if (out.includes(id)) continue
    out.push(id)
    if (out.length === count) break
  }
  if (out.length === 0) return contrastPalette(makeRng(mixSeed(seed, 0x9a)), count)

  const anchor = out[0]
  if (anchor === undefined) return contrastPalette(makeRng(mixSeed(seed, 0x9a)), count)
  const pool = [...speciesNeighbours(anchor, SPECIES.length), ...ALL_IDS]
  while (out.length < count) {
    const candidate = pool.find((id) => !out.includes(id))
    if (candidate === undefined) break
    // Слишком близкую породу берём только тогда, когда далёких уже не осталось.
    const far = pool.find((id) => !out.includes(id) && out.every((chosen) => speciesDistance(chosen, id) >= MIN_PALETTE_DISTANCE))
    out.push(far ?? candidate)
  }
  return out
}

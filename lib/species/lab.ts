import type { SpeciesId } from '@/lib/engine'
import { SPECIES, getSpeciesById, type Lab } from './index'

/**
 * Евклидово расстояние в CIELAB. Не CIEDE2000: справочник пород маленький и
 * заведомо разнесённый по светлоте, а деление на пороги «различимо глазом»
 * у нас грубое, поэтому точность дельты-E 2000 здесь ничего не добавила бы.
 */
export function labDistance(a: Lab, b: Lab): number {
  const dL = a.L - b.L
  const da = a.a - b.a
  const db = a.b - b.b
  return Math.sqrt(dL * dL + da * da + db * db)
}

export function speciesDistance(a: SpeciesId, b: SpeciesId): number {
  return labDistance(getSpeciesById(a).lab, getSpeciesById(b).lab)
}

export function chroma(lab: Lab): number {
  return Math.sqrt(lab.a * lab.a + lab.b * lab.b)
}

/** Ближайшая реальная порода к произвольному цвету. Ничьи разрешаются по порядку справочника. */
export function nearestSpecies(lab: Lab, exclude: readonly SpeciesId[] = []): SpeciesId {
  const banned = new Set(exclude)
  const pool = SPECIES.filter((s) => !banned.has(s.id))
  // Исключить можно всё: тогда честнее вернуть просто ближайшую, чем бросить исключение
  // посреди пайплайна фотографии.
  const candidates = pool.length > 0 ? pool : SPECIES
  let best = candidates[0]
  if (best === undefined) throw new Error('справочник пород пуст')
  let bestDistance = labDistance(lab, best.lab)
  for (const species of candidates) {
    const d = labDistance(lab, species.lab)
    if (d < bestDistance) {
      best = species
      bestDistance = d
    }
  }
  return best.id
}

/** Ближайшие по цвету породы: основа мутации «замени породу на похожую». */
export function speciesNeighbours(id: SpeciesId, count: number): readonly SpeciesId[] {
  return SPECIES.filter((s) => s.id !== id)
    .map((s) => ({ id: s.id, d: speciesDistance(id, s.id) }))
    .sort((a, b) => a.d - b.d || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, count))
    .map((entry) => entry.id)
}

/**
 * Лесенка по светлоте с прореживанием: подряд идущие породы справочника бывают
 * почти неотличимы (клён и берёза), а в градиенте нужна видимая ступень.
 */
export function lightnessRamp(minDistance = 18): readonly SpeciesId[] {
  const sorted = [...SPECIES].sort((a, b) => b.lab.L - a.lab.L)
  const out: SpeciesId[] = []
  for (const species of sorted) {
    const last = out.at(-1)
    if (last === undefined || speciesDistance(last, species.id) >= minDistance) out.push(species.id)
  }
  return out
}

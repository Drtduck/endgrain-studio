import type { SpeciesId } from '@/lib/engine'
import { SPECIES, type Lab } from '@/lib/species'
import { labDistance } from '@/lib/species/lab'

/**
 * Кластеры фотографии на реальные породы, по одной породе на кластер.
 * Жадное глобальное сопоставление: все пары сортируются по расстоянию, ближайшая
 * свободная пара забирается первой. Запрет повторов принципиален: две «одинаковые»
 * породы на доске означают, что склейка между ними не видна и узор развалится.
 */
export function mapClustersToSpecies(
  centroids: readonly Lab[],
  allowed: readonly SpeciesId[] = SPECIES.map((s) => s.id),
): readonly SpeciesId[] {
  if (centroids.length === 0) return []
  const pool = SPECIES.filter((s) => allowed.includes(s.id))
  if (pool.length === 0) return []

  const pairs: Array<{ cluster: number; id: SpeciesId; d: number }> = []
  centroids.forEach((centroid, cluster) => {
    for (const species of pool) pairs.push({ cluster, id: species.id, d: labDistance(centroid, species.lab) })
  })
  pairs.sort((a, b) => a.d - b.d || a.cluster - b.cluster || a.id.localeCompare(b.id))

  const result = new Array<SpeciesId | null>(centroids.length).fill(null)
  const used = new Set<SpeciesId>()
  for (const pair of pairs) {
    if (result[pair.cluster] !== null) continue
    if (used.has(pair.id)) continue
    result[pair.cluster] = pair.id
    used.add(pair.id)
    if (used.size === Math.min(centroids.length, pool.length)) break
  }

  return result.filter((id): id is SpeciesId => id !== null)
}

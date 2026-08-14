import { z } from 'zod'
import { cellPolygon, polygonAreaMm2, type BoardModel } from '@/lib/engine'
import { speciesByShare } from '@/lib/promo/describe'
import { SPECIES_BY_ID } from '@/lib/species'
import type { GallerySummary } from './types'

/**
 * Сводка карточки для галереи. Считается один раз при публикации серверным
 * compile и хранится денормализованной строкой: список галереи иначе
 * компилировал бы движок на каждую карточку при каждом рендере страницы.
 * speciesByShare уже есть в lib/promo/describe и отдаёт английские имена,
 * здесь нужны id пород: они локале-независимы и хранятся стабильно.
 */
export function buildSummary(model: BoardModel): GallerySummary {
  const byArea = new Map<string, number>()
  for (const cell of model.cells) {
    const area = polygonAreaMm2(cellPolygon(cell))
    byArea.set(cell.speciesId, (byArea.get(cell.speciesId) ?? 0) + area)
  }
  const species = [...byArea.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id)

  return {
    widthMm: Math.round(model.widthMm),
    lengthMm: Math.round(model.lengthMm),
    thicknessMm: Math.round(model.thicknessMm),
    cellCount: model.cells.length,
    species,
  }
}

// Не используется напрямую (species у нас уже id, не имена): экспорт нужен
// только для симметрии с describeBoard в тестах на реальных фикстурах модели.
export { speciesByShare }

const summarySchema = z.object({
  widthMm: z.number().finite().positive(),
  lengthMm: z.number().finite().positive(),
  thicknessMm: z.number().finite().positive(),
  cellCount: z.number().int().nonnegative(),
  species: z.array(z.string()),
})

/** Разбор сводки, прочитанной из базы. Битая строка не должна ронять карточку. */
export function parseSummary(raw: unknown): GallerySummary | null {
  const parsed = summarySchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

/** Породы, отображаемые человеку: локализованное имя, неизвестный id тихо выпадает. */
export function speciesDisplayNames(species: readonly string[], locale: 'ru' | 'en'): readonly string[] {
  return species.flatMap((id) => {
    const s = SPECIES_BY_ID.get(id)
    if (s === undefined) return []
    return [locale === 'ru' ? s.nameRu : s.nameEn]
  })
}

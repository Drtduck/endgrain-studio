import type { BoardModel, Design } from '@/lib/engine'
import { designDisplayName } from '@/lib/designs/name'
import { SPECIES_BY_ID } from '@/lib/species'

/**
 * Словесный портрет доски для промпта генератора картинок и для подписей мерча.
 * Английский тут не каприз: модели картинок понимают породы дерева по английским
 * названиям заметно лучше, чем по русским, а пользователю эта строка не показывается.
 * Чистая функция без DOM и без сети: тестируется напрямую.
 */
export interface BoardDescription {
  /** Породы по убыванию доли в рисунке, английские названия. */
  readonly species: readonly string[]
  /** Габарит в миллиметрах, готовый к подстановке в текст. */
  readonly sizeMm: string
  /** Сколько клеток видно на торце: грубая мера дробности рисунка. */
  readonly cellCount: number
  /** Одна строка целиком, для промпта. */
  readonly text: string
}

/** Породы, отсортированные по суммарной площади на торце: главная первой. */
export function speciesByShare(model: BoardModel): readonly string[] {
  const areaById = new Map<string, number>()
  for (const cell of model.cells) {
    const area = cell.widthMm * cell.heightMm
    areaById.set(cell.speciesId, (areaById.get(cell.speciesId) ?? 0) + area)
  }
  return [...areaById.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => SPECIES_BY_ID.get(id)?.nameEn ?? id)
}

/** Дробность рисунка словами: от «bold» до «fine mosaic». */
export function patternGrain(cellCount: number): string {
  if (cellCount <= 24) return 'bold blocky'
  if (cellCount <= 120) return 'classic checkerboard-scale'
  if (cellCount <= 600) return 'detailed'
  return 'fine mosaic'
}

export function describeBoard(design: Design, model: BoardModel): BoardDescription {
  const species = speciesByShare(model)
  const width = Math.round(model.widthMm)
  const length = Math.round(model.lengthMm)
  const thickness = Math.round(model.thicknessMm)
  const sizeMm = `${width} x ${length} x ${thickness} mm`
  const cellCount = model.cells.length
  const woods = species.length > 0 ? species.join(', ') : 'hardwood'
  // Промпт всегда английский, поэтому и имя документа берём в английской локали.
  const name = designDisplayName(design, 'en')
  const text =
    `An end-grain cutting board named "${name}", ${sizeMm}, ` +
    `made of ${woods}. The end-grain face shows a ${patternGrain(cellCount)} geometric pattern ` +
    `of ${cellCount} square wood blocks, oiled to a satin finish.`
  return { species, sizeMm, cellCount, text }
}

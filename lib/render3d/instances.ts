import type { BoardModel, SpeciesId } from '@/lib/engine'
import { speciesHex } from '@/lib/species'

/** 1 мм = 0.005 юнита сцены: типовая доска 300 мм ложится в полтора юнита, что удобно камере по умолчанию. */
export const SCENE_SCALE = 0.005
/** Клеевой шов между ячейками, мм: без него узор читается плоским пятном, а не набором брусков. */
export const CELL_GAP_MM = 0.6
/** Ячейка уже этого размера всё равно рисуется: лучше тонкая полоска, чем дыра в доске. */
export const MIN_VISIBLE_MM = 0.5
/** Тот же потолок, что и MAX_CELLS движка: модель физически не может дать больше. */
export const MAX_INSTANCES = 4000

export interface InstanceTransform {
  readonly position: readonly [number, number, number]
  readonly scale: readonly [number, number, number]
  /** Детерминированное отклонение тона по id ячейки, -1..1. */
  readonly jitter: number
}

export interface SpeciesGroup {
  readonly speciesId: SpeciesId
  readonly hex: string
  readonly items: readonly InstanceTransform[]
}

export interface BoardInstances {
  readonly groups: readonly SpeciesGroup[]
  readonly total: number
  /** Габарит доски в юнитах сцены: ширина, толщина, длина. */
  readonly sizeUnits: readonly [number, number, number]
  readonly truncated: boolean
}

export interface BuildOptions {
  readonly gapMm?: number
  readonly maxInstances?: number
}

/** FNV-1a по id ячейки: одна и та же ячейка всегда получает один и тот же оттенок. */
export function cellJitter(cellId: string): number {
  let hash = 2166136261
  for (let i = 0; i < cellId.length; i += 1) {
    hash ^= cellId.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) / 0xffffffff) * 2 - 1
}

/**
 * Модель доски в инстансы: по одному массиву на породу, чтобы сцена рисовалась
 * одним InstancedMesh на породу (16 draw call в худшем случае вместо 4000).
 * Доска центрирована по X и Z и стоит на плоскости y = 0.
 */
export function buildInstances(model: BoardModel, opts: BuildOptions = {}): BoardInstances {
  const gapMm = opts.gapMm ?? CELL_GAP_MM
  const maxInstances = opts.maxInstances ?? MAX_INSTANCES
  const halfWidthMm = model.widthMm / 2
  const halfLengthMm = model.lengthMm / 2
  const thicknessMm = model.thicknessMm

  const buckets = new Map<SpeciesId, InstanceTransform[]>()
  let total = 0
  let truncated = false

  for (const cell of model.cells) {
    if (total >= maxInstances) {
      truncated = true
      break
    }
    const widthMm = Math.max(cell.widthMm - gapMm, MIN_VISIBLE_MM)
    const depthMm = Math.max(cell.heightMm - gapMm, MIN_VISIBLE_MM)
    const item: InstanceTransform = {
      position: [
        (cell.xMm + cell.widthMm / 2 - halfWidthMm) * SCENE_SCALE,
        (thicknessMm / 2) * SCENE_SCALE,
        (cell.yMm + cell.heightMm / 2 - halfLengthMm) * SCENE_SCALE,
      ],
      scale: [widthMm * SCENE_SCALE, thicknessMm * SCENE_SCALE, depthMm * SCENE_SCALE],
      jitter: cellJitter(cell.id),
    }
    const bucket = buckets.get(cell.speciesId)
    if (bucket) bucket.push(item)
    else buckets.set(cell.speciesId, [item])
    total += 1
  }

  const groups: SpeciesGroup[] = []
  for (const [speciesId, items] of buckets) {
    groups.push({ speciesId, hex: speciesHex(speciesId), items })
  }

  return {
    groups,
    total,
    sizeUnits: [model.widthMm * SCENE_SCALE, thicknessMm * SCENE_SCALE, model.lengthMm * SCENE_SCALE],
    truncated: truncated || model.truncated,
  }
}

/** Дистанция камеры, при которой доска любого размера попадает в кадр целиком. */
export function cameraDistance(instances: BoardInstances): number {
  const [widthUnits, , lengthUnits] = instances.sizeUnits
  return Math.max(widthUnits, lengthUnits, 0.2) * 1.9 + 0.3
}

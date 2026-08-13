import { cellPolygon, insetConvex, type BoardModel, type Pt, type SpeciesId } from '@/lib/engine'
import { speciesHex } from '@/lib/species'

/** 1 мм = 0.005 юнита сцены: типовая доска 300 мм ложится в полтора юнита, что удобно камере по умолчанию. */
export const SCENE_SCALE = 0.005
/** Клеевой шов между ячейками, мм: без него узор читается плоским пятном, а не набором брусков. */
export const CELL_GAP_MM = 0.6
/** Ячейка уже этого размера всё равно рисуется: лучше тонкая полоска, чем дыра в доске. */
export const MIN_VISIBLE_MM = 0.5
/** Тот же потолок, что и MAX_CELLS движка: модель физически не может дать больше. Актуален только для инстансированного пути - слитая геометрия угловых ячеек в этот потолок не упирается. */
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

/**
 * Прямые узоры (ни у одной ячейки нет `poly`): боксы через `InstancedMesh`, как раньше.
 */
export interface InstancedScene {
  readonly kind: 'instanced'
  readonly groups: readonly SpeciesGroup[]
  readonly total: number
  /** Габарит доски в юнитах сцены: ширина, толщина, длина. */
  readonly sizeUnits: readonly [number, number, number]
  readonly truncated: boolean
}

/**
 * Слитая геометрия на породу: угловые ячейки не инстансируются боксами (это враньё превью -
 * наклонная ячейка не бокс), а собираются в одну `BufferGeometry` на породу через экструзию
 * полигона ячейки на толщину доски. Треугольники не индексированы (плоское затенение, каждая
 * грань со своей нормалью), позиции уже в единицах сцены и центрированы - компоненту достаточно
 * положить массивы в атрибуты и один раз отрисовать.
 */
export interface MergedSpeciesGroup {
  readonly speciesId: SpeciesId
  readonly hex: string
  /** xyz на вершину, уже в единицах сцены и центрировано. */
  readonly positions: Float32Array
  /** xyz на вершину, единичные нормали граней (плоское затенение). */
  readonly normals: Float32Array
  /** Одно значение -1..1 на вершину: детерминированное отклонение тона по id ячейки. */
  readonly jitters: Float32Array
  /** Число ячеек, вошедших в группу. */
  readonly cellCount: number
}

export interface MergedScene {
  readonly kind: 'merged'
  readonly groups: readonly MergedSpeciesGroup[]
  readonly total: number
  readonly sizeUnits: readonly [number, number, number]
  readonly truncated: boolean
}

export type BoardScene = InstancedScene | MergedScene

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

function sizeUnitsOf(model: BoardModel): readonly [number, number, number] {
  return [model.widthMm * SCENE_SCALE, model.thicknessMm * SCENE_SCALE, model.lengthMm * SCENE_SCALE]
}

/** Старый путь: прямоугольные ячейки как инстансы боксов, один InstancedMesh на породу. */
function buildInstancedScene(model: BoardModel, gapMm: number, maxInstances: number): InstancedScene {
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
    kind: 'instanced',
    groups,
    total,
    sizeUnits: sizeUnitsOf(model),
    truncated: truncated || model.truncated,
  }
}

/** Накопитель треугольников (плоское затенение, не индексировано) для одной породы. */
class TriangleAccumulator {
  private positions: number[] = []
  private normals: number[] = []
  private jitters: number[] = []
  cellCount = 0

  pushFace(verts: ReadonlyArray<readonly [number, number, number]>, normal: readonly [number, number, number], jitter: number): void {
    const [nx, ny, nz] = normal
    for (const [x, y, z] of verts) {
      this.positions.push(x, y, z)
      this.normals.push(nx, ny, nz)
      this.jitters.push(jitter)
    }
  }

  toGroup(speciesId: SpeciesId): MergedSpeciesGroup {
    return {
      speciesId,
      hex: speciesHex(speciesId),
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      jitters: new Float32Array(this.jitters),
      cellCount: this.cellCount,
    }
  }
}

/**
 * Экструдирует полигон ячейки (мм, экранные координаты x/y) на толщину доски и складывает
 * треугольники в накопитель породы. Координаты сразу переводятся в единицы сцены и
 * центрируются - слитой геометрии не нужна трансформация на инстанс.
 *
 * Обход `ring` по часовой стрелке в координатах (x, y-вниз). Для верхней грани (нормаль +Y)
 * фан-триангуляция идёт в обратном порядке относительно нижней (нормаль -Y): иначе верхняя
 * грань смотрит внутрь доски. Для боковых стенок нормаль ребра `(dz, 0, -dx)` выведена из того
 * же порядка обхода (см. docs/superpowers/specs/2026-08-13-angled-patterns-plan.md, поток 2.2).
 */
function extrudeCellInto(acc: TriangleAccumulator, ring: readonly Pt[], thicknessMm: number, halfWidthMm: number, halfLengthMm: number, jitter: number): void {
  const n = ring.length
  if (n < 3) return

  const sceneTopY = thicknessMm * SCENE_SCALE
  const top: Array<readonly [number, number, number]> = ring.map(([x, y]) => [
    (x - halfWidthMm) * SCENE_SCALE,
    sceneTopY,
    (y - halfLengthMm) * SCENE_SCALE,
  ])
  const bottom: Array<readonly [number, number, number]> = ring.map(([x, y]) => [
    (x - halfWidthMm) * SCENE_SCALE,
    0,
    (y - halfLengthMm) * SCENE_SCALE,
  ])

  // Нижняя грань, нормаль вниз: фан в порядке обхода кольца.
  for (let i = 1; i < n - 1; i += 1) {
    acc.pushFace([bottom[0]!, bottom[i]!, bottom[i + 1]!], [0, -1, 0], jitter)
  }
  // Верхняя грань, нормаль вверх: фан в обратном порядке.
  for (let i = 1; i < n - 1; i += 1) {
    acc.pushFace([top[0]!, top[i + 1]!, top[i]!], [0, 1, 0], jitter)
  }
  // Боковые стенки: одна пара треугольников на ребро кольца, нормаль наружу.
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n
    const dx = ring[j]![0] - ring[i]![0]
    const dz = ring[j]![1] - ring[i]![1]
    const len = Math.hypot(dx, dz)
    const normal: readonly [number, number, number] = len < 1e-9 ? [0, 0, 0] : [dz / len, 0, -dx / len]
    acc.pushFace([bottom[i]!, top[i]!, bottom[j]!], normal, jitter)
    acc.pushFace([top[i]!, top[j]!, bottom[j]!], normal, jitter)
  }

  acc.cellCount += 1
}

/**
 * Новый путь: хотя бы у одной ячейки есть `poly` (угловой узор). Инстансирование боксов здесь
 * враньё - ячейка не прямоугольник. Вместо него на каждую породу собирается одна слитая
 * геометрия из экструдированных полигонов ячеек (`ExtrudeGeometry` на ячейку дал бы 4000
 * draw call, поэтому вершины копятся в общий буфер вручную).
 */
function buildMergedScene(model: BoardModel, gapMm: number): MergedScene {
  const halfWidthMm = model.widthMm / 2
  const halfLengthMm = model.lengthMm / 2
  const thicknessMm = model.thicknessMm
  const insetMm = gapMm / 2

  const accs = new Map<SpeciesId, TriangleAccumulator>()
  let total = 0

  for (const cell of model.cells) {
    const poly = cellPolygon(cell)
    let ring: readonly Pt[] = insetConvex(poly, insetMm)
    // Ячейка тоньше зазора: лучше нарисовать её как есть, чем оставить дыру в доске.
    if (ring.length < 3) ring = poly
    if (ring.length < 3) continue

    let acc = accs.get(cell.speciesId)
    if (!acc) {
      acc = new TriangleAccumulator()
      accs.set(cell.speciesId, acc)
    }
    extrudeCellInto(acc, ring, thicknessMm, halfWidthMm, halfLengthMm, cellJitter(cell.id))
    total += 1
  }

  const groups: MergedSpeciesGroup[] = []
  for (const [speciesId, acc] of accs) {
    groups.push(acc.toGroup(speciesId))
  }

  return {
    kind: 'merged',
    groups,
    total,
    sizeUnits: sizeUnitsOf(model),
    truncated: model.truncated,
  }
}

/**
 * Модель доски в сцену three.js. Два независимых пути:
 *
 * - ни у одной ячейки нет `poly` (все резы прямые) - прежний путь: массив трансформов на
 *   InstancedMesh, один меш на породу (16 draw call в худшем случае вместо 4000);
 * - хотя бы у одной ячейки есть `poly` (угловой узор) - слитая `BufferGeometry` на породу,
 *   потому что угловая ячейка это не бокс и инстансирование боксами было бы враньём превью.
 *
 * Доска центрирована по X и Z и стоит на плоскости y = 0 в обоих путях.
 */
export function buildInstances(model: BoardModel, opts: BuildOptions = {}): BoardScene {
  const gapMm = opts.gapMm ?? CELL_GAP_MM
  const maxInstances = opts.maxInstances ?? MAX_INSTANCES
  const hasAngledCells = model.cells.some((cell) => cell.poly !== undefined)
  return hasAngledCells ? buildMergedScene(model, gapMm) : buildInstancedScene(model, gapMm, maxInstances)
}

/** Дистанция камеры, при которой доска любого размера попадает в кадр целиком. */
export function cameraDistance(scene: { readonly sizeUnits: readonly [number, number, number] }): number {
  const [widthUnits, , lengthUnits] = scene.sizeUnits
  return Math.max(widthUnits, lengthUnits, 0.2) * 1.9 + 0.3
}

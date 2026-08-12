import type { PrintArea } from './fit'
import type { MerchProductId } from './types'

export { fitPatternCover, fitPatternContain, type PrintArea, type PrintFit } from './fit'

/**
 * Силуэты товаров для локальных мокапов. Рисуем сами, в системе координат 200x200:
 * ни одной внешней картинки, ни одного запроса наружу, поэтому мокап виден сразу
 * и без ключа Printful. Печатать узор в эти же прямоугольники будет компонент.
 */
export interface MerchSilhouette {
  readonly id: MerchProductId
  /** Контур изделия. */
  readonly body: string
  /** Детали поверх контура, рисуются обводкой: ручка кружки, завязки фартука, паспарту постера. */
  readonly strokes: readonly string[]
  /** Цвет материала под принтом. */
  readonly fill: string
  /** Куда ложится узор доски. */
  readonly print: PrintArea
  /** Скругление принта: у кружки узор заворачивается по цилиндру, у постера прямой. */
  readonly printRadius: number
}

export const MERCH_SILHOUETTES: readonly MerchSilhouette[] = [
  {
    id: 'tshirt',
    body:
      'M70 28 L52 34 L24 52 L38 82 L58 70 L58 172 L142 172 L142 70 L162 82 L176 52 ' +
      'L148 34 L130 28 C126 44 114 52 100 52 C86 52 74 44 70 28 Z',
    strokes: ['M70 28 C74 44 86 52 100 52 C114 52 126 44 130 28'],
    fill: '#f2ede4',
    print: { x: 68, y: 74, w: 64, h: 64 },
    printRadius: 2,
  },
  {
    id: 'mug',
    body: 'M52 56 h84 a4 4 0 0 1 4 4 v76 a20 20 0 0 1 -20 20 h-52 a20 20 0 0 1 -20 -20 v-76 a4 4 0 0 1 4 -4 z',
    strokes: ['M142 74 a26 26 0 0 1 0 52', 'M52 62 h88'],
    fill: '#f6f4f0',
    print: { x: 60, y: 68, w: 68, h: 72 },
    printRadius: 6,
  },
  {
    id: 'poster',
    body: 'M46 22 h108 a3 3 0 0 1 3 3 v150 a3 3 0 0 1 -3 3 h-108 a3 3 0 0 1 -3 -3 v-150 a3 3 0 0 1 3 -3 z',
    strokes: ['M56 32 h88 v112 h-88 z'],
    fill: '#faf8f4',
    print: { x: 56, y: 32, w: 88, h: 112 },
    printRadius: 1,
  },
  {
    id: 'apron',
    body:
      'M74 30 h52 v8 a32 32 0 0 0 32 32 v88 a12 12 0 0 1 -12 12 h-92 a12 12 0 0 1 -12 -12 ' +
      'v-88 a32 32 0 0 0 32 -32 z',
    strokes: ['M74 30 L44 46', 'M126 30 L156 46', 'M42 92 h116'],
    fill: '#e9e2d5',
    print: { x: 68, y: 100, w: 64, h: 52 },
    printRadius: 2,
  },
]

export const MERCH_SILHOUETTE_BY_ID: ReadonlyMap<MerchProductId, MerchSilhouette> = new Map(
  MERCH_SILHOUETTES.map((s) => [s.id, s]),
)

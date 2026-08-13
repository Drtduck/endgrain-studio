import type { Design, Panel, Row, SpeciesId } from '@/lib/engine'
import type { MessageKey } from '@/lib/i18n'
import { GRID_ALLOWANCE_MM, GRID_KERF_MM, GRID_THICKNESS_MM, GRID_TRIM_MM, hash2, makeGridDesign, pick, uniform } from './grid'
import { DEFAULT_PLANER_WIDTH_MM, SCHEMA_VERSION } from '@/lib/engine'

export type TemplateGroup = 'checkerboard' | 'brick' | 'stripes' | 'chess' | 'special' | 'angled'

export interface BoardTemplate {
  readonly id: string
  readonly group: TemplateGroup
  readonly nameKey: MessageKey
  readonly build: () => Design
}

export const TEMPLATE_GROUPS: readonly TemplateGroup[] = ['checkerboard', 'brick', 'stripes', 'chess', 'special', 'angled']

export function groupNameKey(group: TemplateGroup): MessageKey {
  return `tplGroup.${group}` as MessageKey
}

const DARK: SpeciesId = 'walnut'
const LIGHT: SpeciesId = 'maple'
const WARM: SpeciesId = 'cherry'
const ACCENT: SpeciesId = 'padauk'
const BLACK: SpeciesId = 'wenge'

/**
 * Большинство шаблонов ниже строятся на прямом угле (Row.angleDeg = 0, единственный режим,
 * который поддерживает финальный поперечный рез). Угловые узоры (шеврон, ромб, кубики) живут
 * в группе 'angled' ближе к концу файла: у них наклонён вклеенный срез SliceRef, а не сам ряд
 * доски (SliceRef.angleDeg, движок это умеет). «Диагонали» ниже - диагонали цвета по квадратной
 * сетке, а не косые резы.
 */
function checkerboardClassic(): Design {
  return makeGridDesign({
    id: 'checkerboard-classic',
    nameKey: 'tpl.checkerboard-classic',
    colWidthsMm: uniform(8, 30),
    rowHeightsMm: uniform(8, 30),
    at: (col, row) => ((col + row) % 2 === 0 ? DARK : LIGHT),
  })
}

function checkerboardFine(): Design {
  return makeGridDesign({
    id: 'checkerboard-fine',
    nameKey: 'tpl.checkerboard-fine',
    colWidthsMm: uniform(12, 25),
    rowHeightsMm: uniform(12, 25),
    at: (col, row) => ((col + row) % 2 === 0 ? DARK : LIGHT),
  })
}

function checkerboardThree(): Design {
  return makeGridDesign({
    id: 'checkerboard-three',
    nameKey: 'tpl.checkerboard-three',
    colWidthsMm: uniform(9, 30),
    rowHeightsMm: uniform(9, 30),
    at: (col, row) => ((col + row) % 2 === 0 ? LIGHT : row % 4 < 2 ? DARK : ACCENT),
  })
}

function blocks2x2(): Design {
  return makeGridDesign({
    id: 'blocks-2x2',
    nameKey: 'tpl.blocks-2x2',
    colWidthsMm: uniform(12, 25),
    rowHeightsMm: uniform(12, 25),
    at: (col, row) => ((Math.floor(col / 2) + Math.floor(row / 2)) % 2 === 0 ? LIGHT : DARK),
  })
}

function brickHalf(): Design {
  return makeGridDesign({
    id: 'brick-half',
    nameKey: 'tpl.brick-half',
    colWidthsMm: uniform(10, 30),
    rowHeightsMm: uniform(10, 30),
    // Кирпич в два блока со сдвигом на половину: нечётный ряд начинается с половинки.
    at: (col, row) => (Math.floor((col + (row % 2)) / 2) % 2 === 0 ? LIGHT : DARK),
  })
}

function brickThird(): Design {
  const palette: readonly SpeciesId[] = [LIGHT, DARK, WARM]
  return makeGridDesign({
    id: 'brick-third',
    nameKey: 'tpl.brick-third',
    colWidthsMm: uniform(12, 25),
    rowHeightsMm: uniform(12, 25),
    at: (col, row) => pick(palette, Math.floor((col + (row % 3)) / 3) + row),
  })
}

function stripesWide(): Design {
  return makeGridDesign({
    id: 'stripes-wide',
    nameKey: 'tpl.stripes-wide',
    colWidthsMm: uniform(6, 50),
    rowHeightsMm: uniform(8, 30),
    at: (col) => (col % 2 === 0 ? LIGHT : DARK),
  })
}

function pinstripe(): Design {
  // Шесть пар «широкая полоса плюс кант»: 6 * (46 + 8) = 324 мм, впритык под рейсмус 330.
  const cols: number[] = []
  for (let i = 0; i < 6; i += 1) cols.push(46, 8)
  return makeGridDesign({
    id: 'pinstripe',
    nameKey: 'tpl.pinstripe',
    colWidthsMm: cols,
    rowHeightsMm: uniform(8, 35),
    at: (col) => (col % 2 === 1 ? BLACK : LIGHT),
  })
}

function gradientStripes(): Design {
  const ramp: readonly SpeciesId[] = ['maple', 'ash', 'red-oak', 'cherry', 'walnut', 'wenge']
  return makeGridDesign({
    id: 'gradient-stripes',
    nameKey: 'tpl.gradient-stripes',
    colWidthsMm: uniform(12, 25),
    rowHeightsMm: uniform(8, 30),
    // Зеркальная лесенка: светлое по краям, тёмное в середине.
    at: (col) => pick(ramp, col < 6 ? col : 11 - col),
  })
}

function diagonalLadder(): Design {
  const palette: readonly SpeciesId[] = [LIGHT, WARM, DARK, BLACK]
  return makeGridDesign({
    id: 'diagonal-ladder',
    nameKey: 'tpl.diagonal-ladder',
    colWidthsMm: uniform(8, 35),
    rowHeightsMm: uniform(12, 30),
    at: (col, row) => pick(palette, col + row),
  })
}

function diagonalFine(): Design {
  const palette: readonly SpeciesId[] = [LIGHT, ACCENT, DARK]
  return makeGridDesign({
    id: 'diagonal-fine',
    nameKey: 'tpl.diagonal-fine',
    colWidthsMm: uniform(12, 25),
    rowHeightsMm: uniform(12, 25),
    at: (col, row) => pick(palette, col + row * 2),
  })
}

function accentRows(): Design {
  // Каждый третий ряд - тонкий поперечный акцент 8 мм.
  const rowsMm: number[] = []
  for (let i = 0; i < 4; i += 1) rowsMm.push(30, 30, 8)
  return makeGridDesign({
    id: 'accent-rows',
    nameKey: 'tpl.accent-rows',
    colWidthsMm: uniform(10, 30),
    rowHeightsMm: rowsMm,
    at: (col, row) => (row % 3 === 2 ? ACCENT : (col + row) % 2 === 0 ? LIGHT : DARK),
  })
}

function frameBorder(): Design {
  const size = 10
  return makeGridDesign({
    id: 'frame-border',
    nameKey: 'tpl.frame-border',
    colWidthsMm: uniform(size, 30),
    rowHeightsMm: uniform(size, 30),
    at: (col, row) => {
      const onBorder = col === 0 || row === 0 || col === size - 1 || row === size - 1
      if (onBorder) return BLACK
      return (col + row) % 2 === 0 ? LIGHT : DARK
    },
  })
}

function chess8x8(): Design {
  // Настоящее игровое поле: 8 клеток по 32 мм плюс бортик 20 мм с каждой стороны.
  const cols = [20, ...uniform(8, 32), 20]
  return makeGridDesign({
    id: 'chess-8x8',
    nameKey: 'tpl.chess-8x8',
    colWidthsMm: cols,
    rowHeightsMm: cols,
    at: (col, row) => {
      const onBorder = col === 0 || row === 0 || col === cols.length - 1 || row === cols.length - 1
      if (onBorder) return WARM
      return (col + row) % 2 === 0 ? LIGHT : DARK
    },
  })
}

function mosaicRandom(): Design {
  const palette: readonly SpeciesId[] = [LIGHT, WARM, DARK, ACCENT]
  return makeGridDesign({
    id: 'mosaic-random',
    nameKey: 'tpl.mosaic-random',
    colWidthsMm: uniform(10, 30),
    rowHeightsMm: uniform(10, 30),
    // Сид зашит: «случайный» узор обязан быть одинаковым у всех, иначе ссылка покажет другую доску.
    at: (col, row) => pick(palette, hash2(col, row, 1337)),
  })
}

/**
 * Единственный шаблон с SliceRef: центральная вставка - срез отдельной панели,
 * поэтому в середине доски ячейки вдвое мельче рядов. Глубина ровно 2, угол 0.
 *
 * Срез INNER вклеивается колонкой в MAIN и физически обязан быть не короче суммарной
 * длины всех рядов MAIN (панель.length): 7 рядов по 30 мм + припуски + kerf дают 284 мм
 * (см. lib/engine/panels.ts: panelLengthMm). Заготовка INNER взята на 20 полос по 15 мм -
 * 300 мм, с запасом ~16 мм под ширину рейсмуса (лимит 330 мм), а не впритык к пределу.
 */
export function makeInlayBand(): Design {
  const inner: Panel = {
    id: 'INNER',
    elements: Array.from({ length: 20 }, (_, i) => ({
      kind: 'strip' as const,
      speciesId: i % 2 === 0 ? ACCENT : LIGHT,
      widthMm: 15,
    })),
  }
  const main: Panel = {
    id: 'MAIN',
    elements: [
      { kind: 'strip', speciesId: LIGHT, widthMm: 60 },
      { kind: 'strip', speciesId: DARK, widthMm: 30 },
      { kind: 'sliceRef', panelId: 'INNER', thicknessMm: 90, angleDeg: 0, offsetMm: 0 },
      { kind: 'strip', speciesId: DARK, widthMm: 30 },
      { kind: 'strip', speciesId: LIGHT, widthMm: 60 },
    ],
  }
  const rows: Row[] = Array.from({ length: 7 }, (_, i) => ({
    id: `r${i}`,
    panelId: 'MAIN',
    thicknessMm: 30,
    angleDeg: 0,
    flip: false,
    mirror: false,
    trimMm: GRID_TRIM_MM,
  }))

  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'inlay-band',
    name: '',
    nameKey: 'tpl.inlay-band',
    species: [LIGHT, ACCENT, DARK],
    panels: [main, inner],
    rows,
    board: { targetWidthMm: 270, targetLengthMm: 210, thicknessMm: GRID_THICKNESS_MM },
    kerfMm: GRID_KERF_MM,
    planingAllowanceMm: GRID_ALLOWANCE_MM,
    planerWidthMm: DEFAULT_PLANER_WIDTH_MM,
  }
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/**
 * Колонки углового шаблона: срезы одной и той же панели INNER, знак угла чередуется,
 * offsetMm выведен из правила сцепки base_{k+1} = base_k + t_k * tan(angleDeg_k) (раздел 0.5
 * плана угловых узоров) - на стыке любых двух соседних колонок линия V не разъезжается.
 * startSign задаёт знак первой колонки: для чётного числа колонок разворот порядка + смена
 * знака (Row.mirror) - тождественное преобразование, поэтому встречную V даёт только вторая
 * панель со сдвинутой фазой (startSign = -1), а не зеркало первой.
 */
function chevronMain(id: string, count: number, thicknessMm: number, angleAbsDeg: number, startSign: 1 | -1 = 1): Panel {
  const elements: Panel['elements'][number][] = []
  let base = 0
  for (let k = 0; k < count; k += 1) {
    const sign = k % 2 === 0 ? startSign : -startSign
    const angleDeg = sign * angleAbsDeg
    elements.push({ kind: 'sliceRef', panelId: 'INNER', thicknessMm, angleDeg, offsetMm: base })
    base += thicknessMm * Math.tan(toRad(angleDeg))
  }
  return { id, elements }
}

function stripedInner(a: SpeciesId, b: SpeciesId, count: number, widthMm: number): Panel {
  return {
    id: 'INNER',
    elements: Array.from({ length: count }, (_, i) => ({
      kind: 'strip' as const,
      speciesId: i % 2 === 0 ? a : b,
      widthMm,
    })),
  }
}

function chevronRows(count: number, thicknessMm: number, panelId = 'MAIN'): Row[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `r${i}`,
    panelId,
    thicknessMm,
    angleDeg: 0,
    flip: false,
    mirror: false,
    trimMm: GRID_TRIM_MM,
  }))
}

/** Ряды чередуют панель по списку id (по кругу): используется ромбом для встречных V. */
function chevronRowsAlternating(panelIds: readonly string[], count: number, thicknessMm: number): Row[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `r${i}`,
    panelId: panelIds[i % panelIds.length]!,
    thicknessMm,
    angleDeg: 0,
    flip: false,
    mirror: false,
    trimMm: GRID_TRIM_MM,
  }))
}

/**
 * Классический шеврон, 45°: канонический угол миксинтарсии. Толщина среза 70 мм даёт крупный,
 * хорошо читаемый зубец (амплитуда t * tan(45°) = 70 мм, см. раздел 0.5 плана).
 */
function chevronClassic(): Design {
  const main = chevronMain('MAIN', 4, 70, 45)
  const inner = stripedInner(LIGHT, DARK, 10, 25)
  const rows = chevronRows(6, 30)
  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'chevron-classic',
    name: '',
    nameKey: 'tpl.chevron-classic',
    species: [LIGHT, DARK],
    panels: [main, inner],
    rows,
    board: { targetWidthMm: 280, targetLengthMm: 180, thicknessMm: GRID_THICKNESS_MM },
    kerfMm: GRID_KERF_MM,
    planingAllowanceMm: GRID_ALLOWANCE_MM,
    planerWidthMm: DEFAULT_PLANER_WIDTH_MM,
  }
}

/** Пологий шеврон, 25°: тот же приём на меньшем угле - зубец мельче, доска выглядит спокойнее. */
function chevronGentle(): Design {
  const main = chevronMain('MAIN', 5, 60, 25)
  const inner = stripedInner(WARM, DARK, 10, 25)
  const rows = chevronRows(6, 30)
  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'chevron-gentle',
    name: '',
    nameKey: 'tpl.chevron-gentle',
    species: [WARM, DARK],
    panels: [main, inner],
    rows,
    board: { targetWidthMm: 300, targetLengthMm: 180, thicknessMm: GRID_THICKNESS_MM },
    kerfMm: GRID_KERF_MM,
    planingAllowanceMm: GRID_ALLOWANCE_MM,
    planerWidthMm: DEFAULT_PLANER_WIDTH_MM,
  }
}

/**
 * Ромб: тот же шеврон, но Row.mirror чередуется по рядам. Зеркальный ряд одновременно
 * переворачивает порядок колонок и знак наклона (compile.ts), поэтому соседние ряды дают
 * встречные V, а пара рядов читается как горизонтальный ряд ромбов.
 */
/**
 * Ромб: две панели колонок на одной и той же INNER, со встречным стартовым знаком угла
 * (MAIN и MAIN2), ряды поочерёдно ссылаются то на одну, то на другую. На одной и той же
 * х-позиции соседние ряды дают противоположно наклонённую линию - пара рядов читается
 * как горизонтальный ряд ромбов.
 */
function diamondClassic(): Design {
  const mainUp = chevronMain('MAIN', 4, 70, 45, 1)
  const mainDown = chevronMain('MAIN2', 4, 70, 45, -1)
  const inner = stripedInner(LIGHT, DARK, 10, 25)
  const rows = chevronRowsAlternating(['MAIN', 'MAIN2'], 6, 30)
  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'diamond-classic',
    name: '',
    nameKey: 'tpl.diamond-classic',
    species: [LIGHT, DARK],
    panels: [mainUp, mainDown, inner],
    rows,
    board: { targetWidthMm: 280, targetLengthMm: 180, thicknessMm: GRID_THICKNESS_MM },
    kerfMm: GRID_KERF_MM,
    planingAllowanceMm: GRID_ALLOWANCE_MM,
    planerWidthMm: DEFAULT_PLANER_WIDTH_MM,
  }
}

function tumblingColumns(
  count: number,
  t: number,
  angleAbsDeg: number,
  sourceIds: readonly [string, string, string],
  startSign: 1 | -1,
): Panel['elements'][number][] {
  const elements: Panel['elements'][number][] = []
  let base = 0
  for (let k = 0; k < count; k += 1) {
    const phase = k % 3
    const sign = startSign * (phase === 1 ? -1 : 1)
    const angleDeg = sign * angleAbsDeg
    elements.push({ kind: 'sliceRef', panelId: sourceIds[phase]!, thicknessMm: t, angleDeg, offsetMm: base })
    base += t * Math.tan(toRad(angleDeg))
  }
  return elements
}

/**
 * Tumbling blocks: три однопородные панели-источники (иллюзию куба даёт форма
 * ячейки-параллелограмма и три оттенка, а не полосы внутри среза), уложенные по той же
 * двухпанельной схеме встречного знака, что и ромб: MAIN/MAIN2 с противоположным startSign,
 * ряды поочерёдно ссылаются то на одну, то на другую - соседние ряды дают встречные грани.
 */
function tumblingBlocks(): Design {
  const a: SpeciesId = LIGHT
  const b: SpeciesId = DARK
  const c: SpeciesId = WARM
  const t = 50
  const angleAbsDeg = 30
  const sourceWidthMm = 220
  const sourceIds: readonly [string, string, string] = ['INNER_A', 'INNER_B', 'INNER_C']
  const mainUp: Panel = { id: 'MAIN', elements: tumblingColumns(6, t, angleAbsDeg, sourceIds, 1) }
  const mainDown: Panel = { id: 'MAIN2', elements: tumblingColumns(6, t, angleAbsDeg, sourceIds, -1) }
  const sources: Panel[] = [
    { id: 'INNER_A', elements: [{ kind: 'strip', speciesId: a, widthMm: sourceWidthMm }] },
    { id: 'INNER_B', elements: [{ kind: 'strip', speciesId: b, widthMm: sourceWidthMm }] },
    { id: 'INNER_C', elements: [{ kind: 'strip', speciesId: c, widthMm: sourceWidthMm }] },
  ]
  const rows = chevronRowsAlternating(['MAIN', 'MAIN2'], 5, 28)
  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'tumbling-blocks',
    name: '',
    nameKey: 'tpl.tumbling-blocks',
    species: [a, b, c],
    panels: [mainUp, mainDown, ...sources],
    rows,
    board: { targetWidthMm: 300, targetLengthMm: 140, thicknessMm: GRID_THICKNESS_MM },
    kerfMm: GRID_KERF_MM,
    planingAllowanceMm: GRID_ALLOWANCE_MM,
    planerWidthMm: DEFAULT_PLANER_WIDTH_MM,
  }
}

function template(id: string, group: TemplateGroup, build: () => Design): BoardTemplate {
  return { id, group, nameKey: `tpl.${id}` as MessageKey, build }
}

export const TEMPLATES: readonly BoardTemplate[] = [
  template('checkerboard-classic', 'checkerboard', checkerboardClassic),
  template('checkerboard-fine', 'checkerboard', checkerboardFine),
  template('checkerboard-three', 'checkerboard', checkerboardThree),
  template('blocks-2x2', 'checkerboard', blocks2x2),
  template('brick-half', 'brick', brickHalf),
  template('brick-third', 'brick', brickThird),
  template('stripes-wide', 'stripes', stripesWide),
  template('pinstripe', 'stripes', pinstripe),
  template('gradient-stripes', 'stripes', gradientStripes),
  template('diagonal-ladder', 'stripes', diagonalLadder),
  template('diagonal-fine', 'stripes', diagonalFine),
  template('accent-rows', 'stripes', accentRows),
  template('frame-border', 'chess', frameBorder),
  template('chess-8x8', 'chess', chess8x8),
  template('mosaic-random', 'special', mosaicRandom),
  template('inlay-band', 'special', makeInlayBand),
  template('chevron-classic', 'angled', chevronClassic),
  template('chevron-gentle', 'angled', chevronGentle),
  template('diamond-classic', 'angled', diamondClassic),
  template('tumbling-blocks', 'angled', tumblingBlocks),
]

export function templateById(id: string): BoardTemplate | undefined {
  return TEMPLATES.find((tpl) => tpl.id === id)
}

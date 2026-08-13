import {
  DEFAULT_PLANER_WIDTH_MM,
  SCHEMA_VERSION,
  usableSliceLengthMm,
  type Design,
  type Panel,
  type PanelElement,
  type Row,
  type SpeciesId,
} from '@/lib/engine'
import { GRID_ALLOWANCE_MM, GRID_KERF_MM, GRID_THICKNESS_MM, GRID_TRIM_MM } from '@/lib/designs/grid'
import { roundHalf, sumMm } from '@/lib/designs/fit'
import { genomeKey, type Genome } from './genome'

/**
 * Коридор толщины наклонной колонки (SliceRef.thicknessMm), мм. Раздел 0.5 плана: амплитуда
 * зубца шеврона равна t * tan(phi), из тонких срезов рисунок не читается.
 */
const MIN_SLICE_THICKNESS_MM = 50
const MAX_SLICE_THICKNESS_MM = 100
/** Потолок ширины щита MAIN (сумма толщин колонок): держим запас от рейсмуса 330 мм. */
const MAX_MAIN_WIDTH_MM = 300
/** Ширина щита INNER (источника среза): с запасом покрывает типовую длину MAIN и 1/cos(phi). */
const INNER_STRIP_WIDTH_MM = 30
const INNER_STRIP_COUNT = 10

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

function clampNum(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, value))
}

/**
 * Длина щита MAIN, которую нужно покрыть срезом INNER: сумма (толщина ряда + припуск на
 * строгание + торцевой припуск) плюс kerf между рядами. Дословно повторяет panelLengthMm из
 * lib/engine/panels.ts для рядов с angleDeg = 0 (cos 0 = 1, деления нет) - ряды доски у всех
 * трёх угловых семейств прямые, наклон только на вклеенном срезе (решение 0.2 плана).
 */
function requiredMainLenMm(rowThicknessesMm: readonly number[]): number {
  if (rowThicknessesMm.length === 0) return 0
  const cut = sumMm(rowThicknessesMm.map((t) => t + GRID_ALLOWANCE_MM + GRID_TRIM_MM))
  const kerfSum = GRID_KERF_MM * (rowThicknessesMm.length - 1)
  return cut + kerfSum
}

/**
 * Убирает лишние ряды, пока срез INNER под углом phi физически короче требуемой длины MAIN.
 * Сравнивает с usableSliceLengthMm, а не с сырой диагональю W/cos φ: параллелограмм-заготовка
 * держит полную ширину колонки только на части своей длины (правый край сдвинут относительно
 * левого на t·tan φ, см. lib/engine/panels.usableSliceLengthMm и compile.ts expandSliceRef).
 * Запас без деления на cos ("requiredMm + 20" у tumbling) уже был достаточен раньше, но SLICE_TOO_SHORT
 * теперь считает честно, поэтому thicknessMm колонки обязателен.
 */
function trimRowsToFitSlice(
  rowHeightsMm: readonly number[],
  innerWidthMm: number,
  thicknessMm: number,
  angleAbsDeg: number,
): number[] {
  const usableLenMm = usableSliceLengthMm(innerWidthMm, thicknessMm, angleAbsDeg)
  const out = [...rowHeightsMm]
  while (out.length > 1 && requiredMainLenMm(out) > usableLenMm) out.pop()
  return out
}

function straightRows(panelId: string, rowHeightsMm: readonly number[]): Row[] {
  return rowHeightsMm.map((thicknessMm, index) => ({
    id: `r${index}`,
    panelId,
    thicknessMm,
    angleDeg: 0,
    flip: false,
    mirror: false,
    trimMm: GRID_TRIM_MM,
  }))
}

/** Ряды чередуют панель по списку id (по кругу): используется diamond'ом для встречных V. */
function straightRowsAlternating(panelIds: readonly string[], rowHeightsMm: readonly number[]): Row[] {
  return rowHeightsMm.map((thicknessMm, index) => ({
    id: `r${index}`,
    panelId: panelIds[index % panelIds.length]!,
    thicknessMm,
    angleDeg: 0,
    flip: false,
    mirror: false,
    trimMm: GRID_TRIM_MM,
  }))
}

/**
 * Колонки MAIN: срезы одной и той же панели INNER, знак угла чередуется по колонке, offsetMm
 * выводится из правила сцепки base_{k+1} = base_k + t_k * s_k (раздел 0.5 плана), поэтому
 * граница полос образует непрерывную линию V на стыке любых двух соседних колонок.
 * startSign задаёт знак первой колонки: у чётного числа колонок последовательность
 * (+,-,+,-,...) палиндромна относительно (разворот порядка + смена знака), поэтому получить
 * встречную V только разворотом порядка (Row.mirror) для нечётного n не выйдет - вторая
 * панель со сдвинутой на одну колонку фазой (startSign = -1) даёт настоящую противоположную V.
 */
function chevronColumns(n: number, thicknessMm: number, angleAbsDeg: number, startSign: 1 | -1 = 1): PanelElement[] {
  const out: PanelElement[] = []
  let base = 0
  for (let k = 0; k < n; k += 1) {
    const sign = k % 2 === 0 ? startSign : -startSign
    const angleDeg = sign * angleAbsDeg
    out.push({ kind: 'sliceRef', panelId: 'INNER', thicknessMm, angleDeg, offsetMm: base })
    const sSigned = Math.tan(toRad(angleDeg))
    base += thicknessMm * sSigned
  }
  return out
}

/** Число наклонных колонок и их толщина: из генома, но в собственном коридоре 50-100 мм. */
function columnLayout(genome: Genome): { n: number; t: number; angleAbsDeg: number } {
  const angleAbsDeg = clampNum(Math.abs(genome.params.angleDeg) || 30, 20, 40)
  const t = clampNum(roundHalf((genome.params.cellMm || 24) * 2.6), MIN_SLICE_THICKNESS_MM, MAX_SLICE_THICKNESS_MM)
  let n = clampNum(genome.params.cols || 4, 3, 6)
  while (n * t > MAX_MAIN_WIDTH_MM && n > 2) n -= 1
  return { n: Math.round(n), t, angleAbsDeg }
}

/**
 * Панель первой склейки: полосы шириной INNER_STRIP_WIDTH_MM, чередующие две породы. Из неё
 * колонками нарезается угловой срез. Ширина щита (300 мм) с запасом покрывает длину MAIN
 * даже с учётом деления на cos(phi) в SLICE_TOO_SHORT.
 */
function innerPanel(a: SpeciesId, b: SpeciesId): Panel {
  return {
    id: 'INNER',
    elements: Array.from({ length: INNER_STRIP_COUNT }, (_, i) => ({
      kind: 'strip' as const,
      speciesId: i % 2 === 0 ? a : b,
      widthMm: INNER_STRIP_WIDTH_MM,
    })),
  }
}

function boardOf(id: string, nameKey: string, species: readonly SpeciesId[], panels: readonly Panel[], rows: readonly Row[]): Design {
  const main = panels.find((p) => p.id === 'MAIN')
  const widthMm = main ? sumMm(main.elements.map((el) => (el.kind === 'strip' ? el.widthMm : el.thicknessMm))) : 0
  return {
    schemaVersion: SCHEMA_VERSION,
    id,
    name: '',
    nameKey,
    species,
    panels,
    rows,
    board: { targetWidthMm: widthMm, targetLengthMm: sumMm(rows.map((r) => r.thicknessMm)), thicknessMm: GRID_THICKNESS_MM },
    kerfMm: GRID_KERF_MM,
    planingAllowanceMm: GRID_ALLOWANCE_MM,
    planerWidthMm: DEFAULT_PLANER_WIDTH_MM,
  }
}

/**
 * Chevron: панель P1 (INNER) из чередующихся полос двух пород -> угловой рез с чередующимся
 * знаком угла по колонкам, вклеенный в MAIN. Ряды прямые (Row.angleDeg = 0, решение 0.2).
 */
export function chevronDesign(genome: Genome): Design {
  const [light, dark] = genome.palette
  const a: SpeciesId = light ?? 'maple'
  const b: SpeciesId = dark ?? 'walnut'
  const { n, t, angleAbsDeg } = columnLayout(genome)

  const inner = innerPanel(a, b)
  const main: Panel = { id: 'MAIN', elements: chevronColumns(n, t, angleAbsDeg) }
  const innerWidthMm = INNER_STRIP_COUNT * INNER_STRIP_WIDTH_MM
  const rowHeightsMm = trimRowsToFitSlice([...genome.rowHeightsMm], innerWidthMm, t, angleAbsDeg)
  const rows = straightRows('MAIN', rowHeightsMm)

  return boardOf(`gen-chevron-${genome.seed}`, 'gen.designName.chevron', [a, b], [main, inner], rows)
}

/**
 * Diamond: два набора колонок на одной и той же INNER, с противоположным стартовым знаком
 * угла (MAIN и MAIN2), ряды чередуют, к какому из них они относятся. У чётного числа колонок
 * простой Row.mirror здесь не работает: разворот порядка колонок и смена знака в сумме дают
 * тождество (последовательность +,-,+,-,... палиндромна относительно этой пары преобразований),
 * поэтому нужна вторая, по-настоящему сдвинутая по фазе панель, а не зеркало первой.
 */
export function diamondDesign(genome: Genome): Design {
  const [light, dark] = genome.palette
  const a: SpeciesId = light ?? 'maple'
  const b: SpeciesId = dark ?? 'walnut'
  const { n, t, angleAbsDeg } = columnLayout(genome)

  const inner = innerPanel(a, b)
  const mainUp: Panel = { id: 'MAIN', elements: chevronColumns(n, t, angleAbsDeg, 1) }
  const mainDown: Panel = { id: 'MAIN2', elements: chevronColumns(n, t, angleAbsDeg, -1) }
  const innerWidthMm = INNER_STRIP_COUNT * INNER_STRIP_WIDTH_MM
  const rowHeightsMm = trimRowsToFitSlice([...genome.rowHeightsMm], innerWidthMm, t, angleAbsDeg)
  const rows = straightRowsAlternating(['MAIN', 'MAIN2'], rowHeightsMm)

  return boardOf(`gen-diamond-${genome.seed}`, 'gen.designName.diamond', [a, b], [mainUp, mainDown, inner], rows)
}

/** Колонки tumbling: цикл из трёх однопородных источников, знак угла - по фазе и startSign. */
function tumblingColumns(
  n: number,
  t: number,
  angleAbsDeg: number,
  sourceIds: readonly [string, string, string],
  phaseRotation: number,
  startSign: 1 | -1,
): PanelElement[] {
  const columns: PanelElement[] = []
  let base = 0
  for (let k = 0; k < n; k += 1) {
    const phase = (k + phaseRotation) % 3
    const sign = startSign * (phase === 1 ? -1 : 1)
    const angleDeg = sign * angleAbsDeg
    columns.push({ kind: 'sliceRef', panelId: sourceIds[phase]!, thicknessMm: t, angleDeg, offsetMm: base })
    base += t * Math.tan(toRad(angleDeg))
  }
  return columns
}

/**
 * Tumbling blocks: три однопородные панели-источники (без внутреннего чередования - иллюзию
 * куба даёт форма ячейки-параллелограмма и три оттенка, а не полосы внутри среза), выложенные
 * по той же двухпанельной схеме встречного знака, что и diamond: MAIN_UP/MAIN_DOWN с
 * противоположным startSign, ряды поочерёдно ссылаются то на одну, то на другую. Так соседние
 * ряды дают встречные грани, и рисунок читается как ряд кубиков, а не как одна колонна цвета.
 */
export function tumblingDesign(genome: Genome): Design {
  const [sa, sb, sc] = genome.palette
  const a: SpeciesId = sa ?? 'maple'
  const b: SpeciesId = sb ?? 'walnut'
  const c: SpeciesId = sc ?? 'cherry'
  const { n, t, angleAbsDeg } = columnLayout(genome)

  const rowHeightsMmRaw = [...genome.rowHeightsMm]
  const requiredMm = requiredMainLenMm(rowHeightsMmRaw)
  // Однопородная панель-источник: одна широкая полоса. sliceLengthMm = sourceWidthMm / cos(phi)
  // растёт при делении на cos(phi) <= 1, поэтому requiredMm с запасом (без деления) уже
  // достаточен - лишний запас только удлинил бы щит без пользы (см. PLANER_WIDTH).
  const sourceWidthMm = clampNum(roundHalf(requiredMm + 20), 120, MAX_MAIN_WIDTH_MM)
  const panelFor = (id: string, speciesId: SpeciesId): Panel => ({
    id,
    elements: [{ kind: 'strip', speciesId, widthMm: sourceWidthMm }],
  })
  const sources = [panelFor('INNER_A', a), panelFor('INNER_B', b), panelFor('INNER_C', c)]
  const sourceIds: readonly [string, string, string] = ['INNER_A', 'INNER_B', 'INNER_C']

  // Вращение фазы от сида: без него список пород по колонкам зависел бы только от числа
  // колонок и порядка палитры, и у части сидов совпадал бы буква в букву (мало непохожих
  // раскладок, тест на разнообразие семейства этого не прощает).
  const phaseRotation = genome.seed % 3
  const mainUp: Panel = { id: 'MAIN', elements: tumblingColumns(n, t, angleAbsDeg, sourceIds, phaseRotation, 1) }
  const mainDown: Panel = { id: 'MAIN2', elements: tumblingColumns(n, t, angleAbsDeg, sourceIds, phaseRotation, -1) }

  // Каждая колонка снимается со своей однопородной панели, у SLICE_TOO_SHORT источник тот же
  // sourceWidthMm для всех трёх, поэтому ограничение по длине совпадает с chevron.
  const rowHeightsMm = trimRowsToFitSlice(rowHeightsMmRaw, sourceWidthMm, t, angleAbsDeg)
  const rows = straightRowsAlternating(['MAIN', 'MAIN2'], rowHeightsMm)

  return boardOf(`gen-tumbling-${genome.seed}`, 'gen.designName.tumbling', [a, b, c], [mainUp, mainDown, ...sources], rows)
}

// genomeKey переиспользуется другими семействами файла families.ts как единая точка входа.
export { genomeKey }

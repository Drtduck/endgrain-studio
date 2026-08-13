import {
  DEFAULT_PLANER_WIDTH_MM,
  SCHEMA_VERSION,
  type Design,
  type Panel,
  type Row,
  type SpeciesId,
} from '@/lib/engine'
import { GRID_ALLOWANCE_MM, GRID_KERF_MM, GRID_THICKNESS_MM, GRID_TRIM_MM } from '@/lib/designs/grid'
import { MAX_PANEL_WIDTH_MM, fitWidths, roundHalf, sumMm } from '@/lib/designs/fit'
import { SPECIES } from '@/lib/species'
import { genomeKey, type Genome } from './genome'

const SPECIES_ORDER = new Map(SPECIES.map((s, index) => [s.id, index]))
/** Тоньше этого срез вставки не имеет смысла: движок отбивает ниже 4 мм, глазу нужно больше. */
const MIN_BAND_MM = 12

/**
 * Длина панели MAIN, которую надо получить из среза INNER: сумма (толщина ряда + припуск
 * на строгание + торцевой припуск) плюс kerf между рядами. Дословно повторяет формулу
 * panelLengthMm из lib/engine/panels.ts для случая angleDeg=0 (cos 0 = 1, деления нет).
 */
function requiredMainLenMm(rowThicknessesMm: readonly number[]): number {
  if (rowThicknessesMm.length === 0) return 0
  const cut = sumMm(rowThicknessesMm.map((t) => t + GRID_ALLOWANCE_MM + GRID_TRIM_MM))
  const kerfSum = GRID_KERF_MM * (rowThicknessesMm.length - 1)
  return cut + kerfSum
}

/**
 * Единственное семейство с двумя поколениями склеек: центральная вставка - это срез
 * отдельной панели, вклеенный в наружную. Внутри вставки полосы мельче наружных рядов,
 * поэтому в середине доски появляется мелкий рисунок, недостижимый обычной сеткой.
 */
export function inlayDesign(genome: Genome): Design {
  const [light, mid, accent, extra] = genome.palette
  const outerSpecies: SpeciesId = light ?? 'maple'
  const frameSpecies: SpeciesId = mid ?? 'walnut'
  const innerA: SpeciesId = accent ?? frameSpecies
  const innerB: SpeciesId = extra ?? outerSpecies

  // Геном инкрустации всегда пятиколоночный: край, рамка, вставка, рамка, край.
  const widths = fitWidths([...genome.colWidthsMm], { maxTotal: MAX_PANEL_WIDTH_MM })
  const side = widths[0] ?? 45
  const frame = widths[1] ?? 15
  const bandRaw = widths[2] ?? 60
  // Вставка забирает всё, что осталось от рейсмуса после краёв и рамок.
  const band = Math.max(MIN_BAND_MM, roundHalf(Math.min(bandRaw * 2, MAX_PANEL_WIDTH_MM - 2 * side - 2 * frame)))

  const outer: Panel = {
    id: 'MAIN',
    elements: [
      { kind: 'strip', speciesId: outerSpecies, widthMm: side },
      { kind: 'strip', speciesId: frameSpecies, widthMm: frame },
      { kind: 'sliceRef', panelId: 'INNER', thicknessMm: band, angleDeg: 0, offsetMm: 0 },
      { kind: 'strip', speciesId: frameSpecies, widthMm: frame },
      { kind: 'strip', speciesId: outerSpecies, widthMm: side },
    ],
  }

  // Плотность управляет мелкостью вставки: от шести до восемнадцати полос.
  const innerCount = 6 + Math.round(genome.params.density * 12)
  const innerWidths = fitWidths(new Array(innerCount).fill(roundHalf(MAX_PANEL_WIDTH_MM / innerCount)), {
    maxTotal: MAX_PANEL_WIDTH_MM,
  })
  const inner: Panel = {
    id: 'INNER',
    elements: innerWidths.map((widthMm, index) => ({
      kind: 'strip' as const,
      speciesId: index % 2 === 0 ? innerA : innerB,
      widthMm,
    })),
  }

  // Срез INNER вклеивается колонкой в MAIN и физически обязан быть не короче суммарной
  // длины рядов MAIN (см. lib/engine/panels.ts: panelLengthMm). Геном (clampGenome) этого
  // не знает - он гарантирует изготовимость общими правилами семейства, а не длину среза
  // под конкретную ширину INNER. Поэтому здесь обрезаем хвост рядов, если их суммарная
  // длина с припусками и kerf превышает то, что реально нарастили в INNER.
  const innerLenMm = sumMm(innerWidths)
  const rowHeightsMm = [...genome.rowHeightsMm]
  while (rowHeightsMm.length > 1 && requiredMainLenMm(rowHeightsMm) > innerLenMm) {
    rowHeightsMm.pop()
  }

  const rows: Row[] = rowHeightsMm.map((thicknessMm, index) => ({
    id: `r${index}`,
    panelId: 'MAIN',
    thicknessMm,
    angleDeg: 0,
    flip: false,
    mirror: false,
    trimMm: GRID_TRIM_MM,
  }))

  const used = new Set<SpeciesId>([outerSpecies, frameSpecies, innerA, innerB])
  const species = [...used].sort((a, b) => (SPECIES_ORDER.get(a) ?? 0) - (SPECIES_ORDER.get(b) ?? 0))

  return {
    schemaVersion: SCHEMA_VERSION,
    id: `gen-inlay-${genomeKey(genome).length}-${genome.seed}`,
    name: '',
    nameKey: 'gen.designName.inlay',
    species,
    panels: [outer, inner],
    rows,
    board: {
      targetWidthMm: sumMm(outer.elements.map((el) => (el.kind === 'strip' ? el.widthMm : el.thicknessMm))),
      targetLengthMm: sumMm(rowHeightsMm),
      thicknessMm: GRID_THICKNESS_MM,
    },
    kerfMm: GRID_KERF_MM,
    planingAllowanceMm: GRID_ALLOWANCE_MM,
    planerWidthMm: DEFAULT_PLANER_WIDTH_MM,
  }
}

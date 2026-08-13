import {
  DEFAULT_PLANER_WIDTH_MM,
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

  const rows: Row[] = genome.rowHeightsMm.map((thicknessMm, index) => ({
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
    schemaVersion: 2,
    id: `gen-inlay-${genomeKey(genome).length}-${genome.seed}`,
    name: '',
    nameKey: 'gen.designName.inlay',
    species,
    panels: [outer, inner],
    rows,
    board: {
      targetWidthMm: sumMm(outer.elements.map((el) => (el.kind === 'strip' ? el.widthMm : el.thicknessMm))),
      targetLengthMm: sumMm(genome.rowHeightsMm),
      thicknessMm: GRID_THICKNESS_MM,
    },
    kerfMm: GRID_KERF_MM,
    planingAllowanceMm: GRID_ALLOWANCE_MM,
    planerWidthMm: DEFAULT_PLANER_WIDTH_MM,
  }
}

import type { Design, Panel, Row, SpeciesId } from '@/lib/engine'
import { DEFAULT_NAME_KEY } from './name'

export interface CheckerboardOptions {
  readonly cellMm?: number
  readonly cols?: number
  readonly rows?: number
  readonly thicknessMm?: number
  readonly speciesA?: SpeciesId
  readonly speciesB?: SpeciesId
}

/** Классическая шахматка: две панели первой склейки со сдвинутым порядком пород. */
export function makeCheckerboard(opts: CheckerboardOptions = {}): Design {
  const { cellMm = 30, cols = 8, rows = 8, thicknessMm = 40, speciesA = 'walnut', speciesB = 'maple' } = opts

  const panelOf = (id: string, first: SpeciesId, second: SpeciesId): Panel => ({
    id,
    elements: Array.from({ length: cols }, (_, i) => ({
      kind: 'strip' as const,
      speciesId: i % 2 === 0 ? first : second,
      widthMm: cellMm,
    })),
  })

  const designRows: Row[] = Array.from({ length: rows }, (_, i) => ({
    id: `r${i}`,
    panelId: i % 2 === 0 ? 'A' : 'B',
    thicknessMm: cellMm,
    angleDeg: 0,
    flip: false,
    mirror: false,
    trimMm: 5,
  }))

  return {
    schemaVersion: 2,
    id: 'sample-checkerboard',
    name: '',
    nameKey: DEFAULT_NAME_KEY,
    species: [speciesA, speciesB],
    panels: [panelOf('A', speciesA, speciesB), panelOf('B', speciesB, speciesA)],
    rows: designRows,
    board: { targetWidthMm: cols * cellMm, targetLengthMm: rows * cellMm, thicknessMm },
    kerfMm: 3,
    planingAllowanceMm: 3,
    planerWidthMm: 330,
  }
}

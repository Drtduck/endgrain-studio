import { SCHEMA_VERSION, type Design, type Panel, type SpeciesId } from './types'

export function stripsPanel(id: string, speciesIds: SpeciesId[], widthMm = 25): Panel {
  return { id, elements: speciesIds.map((speciesId) => ({ kind: 'strip', speciesId, widthMm })) }
}

export function baseDesign(overrides: Partial<Design> = {}): Design {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'fixture',
    name: '',
    nameKey: 'design.default',
    species: ['walnut', 'maple'],
    panels: [stripsPanel('A', ['walnut', 'maple']), stripsPanel('B', ['maple', 'walnut'])],
    rows: [
      { id: 'r1', panelId: 'A', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 },
      { id: 'r2', panelId: 'B', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 },
    ],
    board: { targetWidthMm: 50, targetLengthMm: 60, thicknessMm: 40 },
    kerfMm: 3,
    planingAllowanceMm: 3,
    planerWidthMm: 330,
    ...overrides,
  }
}

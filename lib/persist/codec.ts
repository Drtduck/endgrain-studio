import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import type { Design, Panel, PanelElement, Row, SpeciesId } from '@/lib/engine'
import { CURRENT_SCHEMA_VERSION, parseDesign } from './schema'

export const LS_CURRENT_KEY = 'endgrain.current.v1'

export function toCompact(design: Design): unknown {
  const species: SpeciesId[] = [...design.species]
  const speciesIndex = (id: SpeciesId): number => {
    const i = species.indexOf(id)
    if (i >= 0) return i
    species.push(id)
    return species.length - 1
  }
  const panelIndex = (id: string): number => design.panels.findIndex((p) => p.id === id)

  const p = design.panels.map((panel) => [
    panel.id,
    ...panel.elements.map((el) =>
      el.kind === 'strip'
        ? [0, speciesIndex(el.speciesId), el.widthMm]
        : [1, panelIndex(el.panelId), el.thicknessMm, el.angleDeg, el.offsetMm],
    ),
  ])

  const r = design.rows.map((row) => [
    row.id,
    panelIndex(row.panelId),
    row.thicknessMm,
    row.angleDeg,
    (row.flip ? 1 : 0) | (row.mirror ? 2 : 0),
    row.trimMm,
  ])

  return {
    v: CURRENT_SCHEMA_VERSION,
    i: design.id,
    n: design.name,
    // Ключ и подстановки кладём только когда они есть: пустые поля раздували бы ссылку.
    ...(design.nameKey === undefined ? {} : { nk: design.nameKey }),
    ...(design.nameParams === undefined ? {} : { np: design.nameParams }),
    s: species,
    p,
    r,
    b: [design.board.targetWidthMm, design.board.targetLengthMm, design.board.thicknessMm],
    k: design.kerfMm,
    a: design.planingAllowanceMm,
    w: design.planerWidthMm,
  }
}

export function fromCompact(compact: unknown): Design {
  const c = compact as Record<string, unknown>
  const species = c['s'] as SpeciesId[]
  const rawPanels = c['p'] as unknown[][]
  const panelIds = rawPanels.map((row) => row[0] as string)

  const panels: Panel[] = rawPanels.map((row) => ({
    id: row[0] as string,
    elements: row.slice(1).map((raw): PanelElement => {
      const e = raw as number[]
      return e[0] === 0
        ? { kind: 'strip', speciesId: species[e[1] as number] as SpeciesId, widthMm: e[2] as number }
        : {
            kind: 'sliceRef',
            panelId: panelIds[e[1] as number] as string,
            thicknessMm: e[2] as number,
            angleDeg: e[3] as number,
            offsetMm: e[4] as number,
          }
    }),
  }))

  const rows: Row[] = (c['r'] as unknown[][]).map((raw) => ({
    id: raw[0] as string,
    panelId: panelIds[raw[1] as number] as string,
    thicknessMm: raw[2] as number,
    angleDeg: raw[3] as number,
    flip: ((raw[4] as number) & 1) === 1,
    mirror: ((raw[4] as number) & 2) === 2,
    trimMm: raw[5] as number,
  }))

  const b = c['b'] as number[]

  return parseDesign({
    schemaVersion: c['v'],
    id: c['i'],
    name: c['n'],
    nameKey: c['nk'],
    nameParams: c['np'],
    species,
    panels,
    rows,
    board: { targetWidthMm: b[0], targetLengthMm: b[1], thicknessMm: b[2] },
    kerfMm: c['k'],
    planingAllowanceMm: c['a'],
    planerWidthMm: c['w'],
  })
}

export function serializeDesign(design: Design): string {
  return JSON.stringify(toCompact(design))
}

export function deserializeDesign(json: string): Design {
  return fromCompact(JSON.parse(json))
}

export function encodeDesignToHash(design: Design): string {
  return compressToEncodedURIComponent(serializeDesign(design))
}

export function decodeDesignFromHash(hash: string): Design {
  const json = decompressFromEncodedURIComponent(hash.replace(/^#/, ''))
  if (!json) throw new Error('ссылка повреждена: не удалось распаковать проект')
  return deserializeDesign(json)
}

export function saveToLocalStorage(design: Design): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(LS_CURRENT_KEY, serializeDesign(design))
}

export function loadFromLocalStorage(): Design | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(LS_CURRENT_KEY)
  if (!raw) return null
  try {
    return deserializeDesign(raw)
  } catch {
    return null
  }
}

import { isStrip, panelLengthMm, type BoardModel, type Design, type SpeciesId } from '@/lib/engine'
import { getSpeciesById } from '@/lib/species'
import { mm3ToBoardFeet } from '@/lib/units'

export interface LumberNeed {
  readonly speciesId: SpeciesId
  readonly rawVolumeMm3: number
  readonly boardFeet: number
  readonly linearMeters: number
  readonly costUsd: number
  readonly weightKg: number
}

export interface CalcResult {
  readonly bySpecies: readonly LumberNeed[]
  readonly totalBoardFeet: number
  readonly totalCostUsd: number
  readonly totalWeightKg: number
  readonly finishedVolumeMm3: number
  readonly rawVolumeMm3: number
  readonly wastePct: number
  readonly glueUpCount: number
  readonly cutCount: number
}

export function calcProject(design: Design, model: BoardModel): CalcResult {
  const rawBySpecies = new Map<SpeciesId, { rawVolumeMm3: number; linearMeters: number }>()
  const planedThicknessMm = design.board.thicknessMm + design.planingAllowanceMm

  for (const panel of design.panels) {
    const lengthMm = panelLengthMm(design, panel.id)
    for (const el of panel.elements) {
      if (!isStrip(el)) continue
      const acc = rawBySpecies.get(el.speciesId) ?? { rawVolumeMm3: 0, linearMeters: 0 }
      acc.rawVolumeMm3 += el.widthMm * planedThicknessMm * lengthMm
      acc.linearMeters += lengthMm / 1000
      rawBySpecies.set(el.speciesId, acc)
    }
  }

  const finishedBySpecies = new Map<SpeciesId, number>()
  for (const cell of model.cells) {
    const v = cell.widthMm * cell.heightMm * model.thicknessMm
    finishedBySpecies.set(cell.speciesId, (finishedBySpecies.get(cell.speciesId) ?? 0) + v)
  }

  const bySpecies: LumberNeed[] = [...rawBySpecies.entries()]
    .map(([speciesId, { rawVolumeMm3, linearMeters }]) => {
      const species = getSpeciesById(speciesId)
      const boardFeet = mm3ToBoardFeet(rawVolumeMm3)
      return {
        speciesId,
        rawVolumeMm3,
        boardFeet,
        linearMeters,
        costUsd: boardFeet * species.pricePerBoardFootUsd,
        weightKg: ((finishedBySpecies.get(speciesId) ?? 0) * species.densityKgM3) / 1e9,
      }
    })
    .sort((a, b) => b.costUsd - a.costUsd || a.speciesId.localeCompare(b.speciesId))

  const rawVolumeMm3 = bySpecies.reduce((s, x) => s + x.rawVolumeMm3, 0)
  const finishedVolumeMm3 = [...finishedBySpecies.values()].reduce((s, v) => s + v, 0)

  return {
    bySpecies,
    totalBoardFeet: bySpecies.reduce((s, x) => s + x.boardFeet, 0),
    totalCostUsd: bySpecies.reduce((s, x) => s + x.costUsd, 0),
    totalWeightKg: bySpecies.reduce((s, x) => s + x.weightKg, 0),
    finishedVolumeMm3,
    rawVolumeMm3,
    wastePct: rawVolumeMm3 > 0 ? ((rawVolumeMm3 - finishedVolumeMm3) / rawVolumeMm3) * 100 : 0,
    glueUpCount: model.glueUpCount,
    cutCount: model.cutCount,
  }
}

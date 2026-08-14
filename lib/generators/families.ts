import type { Design } from '@/lib/engine'
import { makeGridDesign } from '@/lib/designs/grid'
import type { MessageKey } from '@/lib/i18n'
import type { CellFn } from './cells'
import { chevronDesign, diamondDesign, tumblingDesign } from './angled'
import { FAMILY_IDS, genomeKey, type FamilyId, type Genome } from './genome'
import { inlayDesign } from './inlay'
import { brickCells, gradientCells, stripesCells } from './parametric'
import { chaosCells } from './noise'
import { symmetryCells } from './symmetry'

export interface GeneratorFamily {
  readonly id: FamilyId
  readonly nameKey: MessageKey
  readonly build: (genome: Genome) => Design
}

/** Ключ имени документа для семейства: своя пара строк на каждое, без вложенной подстановки. */
export function familyDesignNameKey(id: FamilyId): MessageKey {
  return `gen.designName.${id}` as MessageKey
}

/** Сетчатое семейство: вся разница между ними умещается в функцию клетки. */
function gridFamily(id: FamilyId, cells: (genome: Genome) => CellFn): GeneratorFamily {
  return {
    id,
    nameKey: `gen.family.${id}` as MessageKey,
    build: (genome) => {
      const at = cells(genome)
      return makeGridDesign({
        id: `gen-${id}-${genome.seed}`,
        nameKey: familyDesignNameKey(id),
        colWidthsMm: [...genome.colWidthsMm],
        rowHeightsMm: [...genome.rowHeightsMm],
        // rowOrder переставляет содержимое рядов, не их высоты: доска сохраняет габарит,
        // а мутация «перемешать ряды» становится дешёвой и обратимой.
        at: (col, row) => at(col, genome.rowOrder[row] ?? row),
      })
    },
  }
}

export const FAMILIES: readonly GeneratorFamily[] = [
  gridFamily('symmetry-pmm', symmetryCells('pmm')),
  gridFamily('symmetry-p4m', symmetryCells('p4m')),
  gridFamily('symmetry-p2', symmetryCells('p2')),
  gridFamily('stripes', stripesCells),
  gridFamily('brick', brickCells),
  gridFamily('gradient', gradientCells),
  gridFamily('chaos', chaosCells),
  { id: 'inlay', nameKey: 'gen.family.inlay' as MessageKey, build: inlayDesign },
  { id: 'chevron', nameKey: 'gen.family.chevron' as MessageKey, build: chevronDesign },
  { id: 'diamond', nameKey: 'gen.family.diamond' as MessageKey, build: diamondDesign },
  { id: 'tumbling', nameKey: 'gen.family.tumbling' as MessageKey, build: tumblingDesign },
]

export function familyById(id: FamilyId): GeneratorFamily {
  const family = FAMILIES.find((f) => f.id === id)
  if (!family) throw new Error(`семейство генератора ${String(id)} не найдено`)
  return family
}

/** Единственный вход: геном даёт обычный Design с ключом имени вместо готовой строки. */
export function toDesign(genome: Genome): Design {
  return familyById(FAMILY_IDS.includes(genome.familyId) ? genome.familyId : 'stripes').build(genome)
}

export { genomeKey }

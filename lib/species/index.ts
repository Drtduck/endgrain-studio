import { EngineError, type SpeciesId } from '@/lib/engine'

export interface Lab {
  readonly L: number
  readonly a: number
  readonly b: number
}

export interface Species {
  readonly id: SpeciesId
  readonly nameRu: string
  readonly nameEn: string
  readonly hex: string
  readonly lab: Lab
  readonly densityKgM3: number
  readonly pricePerBoardFootUsd: number
  readonly shrinkageTangentialPct: number
  readonly shrinkageRadialPct: number
  readonly foodSafe: boolean
}

export const SPECIES: readonly Species[] = [
  { id: 'maple',      nameRu: 'Клён',        nameEn: 'Hard maple',  hex: '#e3caa1', lab: { L: 83.1, a: 5.2,  b: 26.4 }, densityKgM3: 705, pricePerBoardFootUsd: 6.5,  shrinkageTangentialPct: 9.9,  shrinkageRadialPct: 4.8, foodSafe: true },
  { id: 'birch',      nameRu: 'Берёза',      nameEn: 'Birch',       hex: '#e6d3b3', lab: { L: 85.6, a: 3.4,  b: 20.1 }, densityKgM3: 670, pricePerBoardFootUsd: 4.5,  shrinkageTangentialPct: 9.5,  shrinkageRadialPct: 7.3, foodSafe: true },
  { id: 'beech',      nameRu: 'Бук',         nameEn: 'Beech',       hex: '#d9b48b', lab: { L: 76.9, a: 8.1,  b: 27.0 }, densityKgM3: 720, pricePerBoardFootUsd: 4.2,  shrinkageTangentialPct: 11.9, shrinkageRadialPct: 5.5, foodSafe: true },
  { id: 'ash',        nameRu: 'Ясень',       nameEn: 'Ash',         hex: '#d8c09a', lab: { L: 79.2, a: 5.0,  b: 25.3 }, densityKgM3: 675, pricePerBoardFootUsd: 5.2,  shrinkageTangentialPct: 7.8,  shrinkageRadialPct: 4.9, foodSafe: true },
  { id: 'red-oak',    nameRu: 'Дуб красный', nameEn: 'Red oak',     hex: '#c99a6e', lab: { L: 68.4, a: 13.1, b: 29.8 }, densityKgM3: 700, pricePerBoardFootUsd: 5.0,  shrinkageTangentialPct: 8.6,  shrinkageRadialPct: 4.0, foodSafe: true },
  { id: 'white-oak',  nameRu: 'Дуб белый',   nameEn: 'White oak',   hex: '#bf9a68', lab: { L: 66.9, a: 10.4, b: 30.6 }, densityKgM3: 755, pricePerBoardFootUsd: 6.8,  shrinkageTangentialPct: 10.5, shrinkageRadialPct: 5.6, foodSafe: true },
  { id: 'hickory',    nameRu: 'Гикори',      nameEn: 'Hickory',     hex: '#c08d5c', lab: { L: 62.8, a: 13.0, b: 33.2 }, densityKgM3: 815, pricePerBoardFootUsd: 5.6,  shrinkageTangentialPct: 11.0, shrinkageRadialPct: 7.0, foodSafe: true },
  { id: 'cherry',     nameRu: 'Вишня',       nameEn: 'Cherry',      hex: '#a5613b', lab: { L: 50.8, a: 22.1, b: 30.2 }, densityKgM3: 560, pricePerBoardFootUsd: 8.5,  shrinkageTangentialPct: 7.1,  shrinkageRadialPct: 3.7, foodSafe: true },
  { id: 'mahogany',   nameRu: 'Махагони',    nameEn: 'Mahogany',    hex: '#8f4b2e', lab: { L: 41.9, a: 25.6, b: 28.4 }, densityKgM3: 590, pricePerBoardFootUsd: 12.0, shrinkageTangentialPct: 5.1,  shrinkageRadialPct: 3.0, foodSafe: true },
  { id: 'sapele',     nameRu: 'Сапеле',      nameEn: 'Sapele',      hex: '#7f4429', lab: { L: 37.8, a: 23.9, b: 26.7 }, densityKgM3: 670, pricePerBoardFootUsd: 9.5,  shrinkageTangentialPct: 7.4,  shrinkageRadialPct: 4.6, foodSafe: true },
  { id: 'jatoba',     nameRu: 'Ятоба',       nameEn: 'Jatoba',      hex: '#7d3b22', lab: { L: 34.6, a: 25.1, b: 27.5 }, densityKgM3: 910, pricePerBoardFootUsd: 9.0,  shrinkageTangentialPct: 7.3,  shrinkageRadialPct: 4.2, foodSafe: true },
  { id: 'walnut',     nameRu: 'Орех',        nameEn: 'Black walnut',hex: '#5b3a24', lab: { L: 28.4, a: 13.8, b: 18.9 }, densityKgM3: 610, pricePerBoardFootUsd: 13.5, shrinkageTangentialPct: 7.8,  shrinkageRadialPct: 5.5, foodSafe: true },
  { id: 'wenge',      nameRu: 'Венге',       nameEn: 'Wenge',       hex: '#3a2a20', lab: { L: 18.2, a: 6.9,  b: 9.4  }, densityKgM3: 870, pricePerBoardFootUsd: 20.0, shrinkageTangentialPct: 8.1,  shrinkageRadialPct: 4.8, foodSafe: true },
  { id: 'padauk',     nameRu: 'Падук',       nameEn: 'Padauk',      hex: '#a8422a', lab: { L: 40.1, a: 42.3, b: 32.6 }, densityKgM3: 745, pricePerBoardFootUsd: 15.0, shrinkageTangentialPct: 5.2,  shrinkageRadialPct: 3.3, foodSafe: true },
  { id: 'purpleheart',nameRu: 'Амарант',     nameEn: 'Purpleheart', hex: '#5e3a6b', lab: { L: 30.6, a: 24.8, b: -17.9 }, densityKgM3: 880, pricePerBoardFootUsd: 16.0, shrinkageTangentialPct: 6.1,  shrinkageRadialPct: 3.2, foodSafe: true },
  { id: 'yellowheart',nameRu: 'Йеллоухарт',  nameEn: 'Yellowheart', hex: '#d9be3f', lab: { L: 76.4, a: -2.1, b: 60.8 }, densityKgM3: 830, pricePerBoardFootUsd: 12.5, shrinkageTangentialPct: 7.0,  shrinkageRadialPct: 3.6, foodSafe: true },
]

export const SPECIES_BY_ID: ReadonlyMap<SpeciesId, Species> = new Map(SPECIES.map((s) => [s.id, s]))

export function getSpeciesById(id: SpeciesId): Species {
  const s = SPECIES_BY_ID.get(id)
  if (!s) throw new EngineError('UNKNOWN_SPECIES', `порода ${id} не найдена в справочнике`)
  return s
}

export function speciesHex(id: SpeciesId): string {
  return SPECIES_BY_ID.get(id)?.hex ?? '#cccccc'
}

/** Карта тангенциальной усушки для validate, который не должен зависеть от справочника. */
export function shrinkageMap(): Record<SpeciesId, number> {
  return Object.fromEntries(SPECIES.map((s) => [s.id, s.shrinkageTangentialPct]))
}

'use client'

import { calcProject, type CalcResult } from '@/lib/calc'
import { compile, validate, type BoardModel, type Design, type Diagnostic } from '@/lib/engine'
import { SPECIES, shrinkageMap } from '@/lib/species'
import { selectDesign, useStudio } from './studio'

export interface Derived {
  readonly model: BoardModel
  readonly calc: CalcResult
  readonly diagnostics: readonly Diagnostic[]
}

const KNOWN_SPECIES_IDS = SPECIES.map((s) => s.id)
const SHRINKAGE = shrinkageMap()

// Кэш на одну запись: документ иммутабельный, поэтому сравнение по ссылке точное и дешёвое.
// Без него compile и validate считались бы в каждом компоненте отдельно.
let cachedDesign: Design | null = null
let cachedResult: Derived | null = null

export function derive(design: Design): Derived {
  if (cachedDesign === design && cachedResult) return cachedResult
  const model = compile(design)
  const result: Derived = {
    model,
    calc: calcProject(design, model),
    diagnostics: validate(design, { shrinkageByPct: SHRINKAGE, knownSpeciesIds: KNOWN_SPECIES_IDS }),
  }
  cachedDesign = design
  cachedResult = result
  return result
}

export function useDerived(): Derived {
  return derive(useStudio(selectDesign))
}

import { describe, it, expect } from 'vitest'
import { baseDesign } from '@/lib/engine'
import { makeCheckerboard } from '@/lib/designs/samples'
import { derive } from './derived'

describe('derive', () => {
  it('возвращает модель, расчёт и диагностику одним объектом', () => {
    const d = derive(makeCheckerboard({ cols: 2, rows: 2 }))
    expect(d.model.cells).toHaveLength(4)
    expect(d.calc.glueUpCount).toBe(d.model.glueUpCount)
    expect(Array.isArray(d.diagnostics)).toBe(true)
  })

  it('отдаёт тот же объект для того же документа', () => {
    const design = baseDesign()
    expect(derive(design)).toBe(derive(design))
  })

  it('пересчитывает при смене документа', () => {
    const a = derive(baseDesign())
    const b = derive(baseDesign({ board: { targetWidthMm: 50, targetLengthMm: 60, thicknessMm: 60 } }))
    expect(b).not.toBe(a)
    expect(b.model.thicknessMm).toBe(60)
  })

  it('помечает неизвестную породу, потому что справочник передан в validate', () => {
    const design = baseDesign({ panels: [{ id: 'A', elements: [{ kind: 'strip', speciesId: 'ктотакой', widthMm: 25 }] }] })
    expect(derive(design).diagnostics.some((x) => x.code === 'UNKNOWN_SPECIES')).toBe(true)
  })
})

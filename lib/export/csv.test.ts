import { describe, expect, it } from 'vitest'
import { makeCheckerboard } from '@/lib/designs/samples'
import { baseDesign, type Design } from '@/lib/engine'
import { buildCutPlan } from './cutlist'
import { CSV_BOM, cutPlanToCsv } from './csv'

const plan = buildCutPlan(makeCheckerboard(), 'ru')
const csv = cutPlanToCsv(plan, { locale: 'ru' })
const lines = csv.split('\r\n').filter((l) => l !== '')

describe('cutPlanToCsv', () => {
  it('первая строка это заголовок из девяти колонок (добавлена angle_deg)', () => {
    expect(lines[0]?.split(';')).toHaveLength(9)
    expect(lines[0]).toContain('panel')
    expect(lines[0]).toContain('angle_deg')
  })

  it('строк ровно столько, сколько полос и резов', () => {
    expect(lines).toHaveLength(1 + plan.stripCount + plan.crosscutCount + plan.panels.filter((p) => p.pieces.some((x) => x.kind === 'sliceRef')).length)
  })

  it('числа пишет с точкой и в миллиметрах', () => {
    expect(csv).toMatch(/;\d+(\.\d+)?;/)
    expect(csv).not.toContain(',')
  })

  it('экранирует разделитель и кавычки в идентификаторе панели', () => {
    const trickyId = 'до;ска "тест"'
    const trickyPanels = plan.panels.map((p, i) => (i === 0 ? { ...p, panelId: trickyId } : p))
    const tricky = cutPlanToCsv({ ...plan, panels: trickyPanels }, { locale: 'ru' })
    expect(tricky).toContain('"до;ска ""тест"""')
  })

  it('колонка species у поперечного реза пустая, а не название проекта', () => {
    const crosscutLine = lines.find((l) => l.startsWith('crosscut'))
    expect(crosscutLine).toBeDefined()
    const cols = crosscutLine?.split(';') ?? []
    expect(cols[3]).toBe('')
  })

  it('не содержит длинного тире', () => {
    expect(csv.includes(String.fromCharCode(0x2014))).toBe(false)
  })

  it('BOM не входит в строку, он добавляется при скачивании', () => {
    expect(csv.startsWith(CSV_BOM)).toBe(false)
  })
})

function angledDesign(angleDeg: number): Design {
  return baseDesign({
    panels: [
      { id: 'Q', elements: [{ kind: 'strip', speciesId: 'walnut', widthMm: 20 }] },
      { id: 'P', elements: [{ kind: 'sliceRef', panelId: 'Q', thicknessMm: 15, angleDeg, offsetMm: 0 }] },
    ],
    rows: [{ id: 'r1', panelId: 'P', thicknessMm: 20, angleDeg: 0, flip: false, mirror: false, trimMm: 5 }],
  })
}

describe('cutPlanToCsv: угловой срез (снапшот)', () => {
  const angledPlan = buildCutPlan(angledDesign(30), 'ru')
  const angledCsv = cutPlanToCsv(angledPlan, { locale: 'ru' })

  it('строка углового реза несёт свой angle_deg и честный length_mm (sourceWidthMm / cos φ)', () => {
    expect(angledCsv).toMatchInlineSnapshot(`
      "kind;panel;index;species;width_mm;length_mm;thickness_mm;row;angle_deg
      strip;Q;1;Орех;20;32.33;43;;0
      crosscut;Q;1;;20;23.09;15;inlay;30
      inlay;P;1;Q;15;28;43;;30
      crosscut;P;1;;15;15;20;1;0"
    `)
  })

  it('прямой рез (φ=0) пишет angle_deg 0 и не меняет прежние числа', () => {
    const straightCsv = cutPlanToCsv(buildCutPlan(angledDesign(0), 'ru'), { locale: 'ru' })
    const lines = straightCsv.split('\r\n')
    const crosscutQ = lines.find((l) => l.startsWith('crosscut;Q'))
    expect(crosscutQ).toBe('crosscut;Q;1;;20;20;15;inlay;0')
  })
})

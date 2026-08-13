import { describe, expect, it } from 'vitest'
import { makeCheckerboard } from '@/lib/designs/samples'
import { buildCutPlan } from './cutlist'
import { CSV_BOM, cutPlanToCsv } from './csv'

const plan = buildCutPlan(makeCheckerboard(), 'ru')
const csv = cutPlanToCsv(plan, { locale: 'ru' })
const lines = csv.split('\r\n').filter((l) => l !== '')

describe('cutPlanToCsv', () => {
  it('первая строка это заголовок из восьми колонок', () => {
    expect(lines[0]?.split(';')).toHaveLength(8)
    expect(lines[0]).toContain('panel')
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

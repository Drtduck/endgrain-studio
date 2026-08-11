import { describe, it, expect } from 'vitest'
import { compile, hasErrors, panelWidthMm, validate } from '@/lib/engine'
import { SPECIES, shrinkageMap } from '@/lib/species'
import { hash2, makeGridDesign, pick, uniform } from './grid'

const OPTS = { shrinkageByPct: shrinkageMap(), knownSpeciesIds: SPECIES.map((s) => s.id) }

describe('uniform', () => {
  it('делает ровный ряд одинаковых размеров', () => {
    expect(uniform(3, 25)).toEqual([25, 25, 25])
    expect(uniform(0, 25)).toEqual([])
  })
})

describe('hash2 и pick', () => {
  it('хэш детерминирован и зависит от всех трёх аргументов', () => {
    expect(hash2(1, 2, 7)).toBe(hash2(1, 2, 7))
    expect(hash2(1, 2, 7)).not.toBe(hash2(2, 1, 7))
    expect(hash2(1, 2, 7)).not.toBe(hash2(1, 2, 8))
  })

  it('выбор по индексу закольцован', () => {
    expect(pick(['a', 'b'], 0)).toBe('a')
    expect(pick(['a', 'b'], 3)).toBe('b')
  })

  it('пустой список - это ошибка вызова, а не тихий undefined', () => {
    expect(() => pick([], 0)).toThrow()
  })
})

describe('makeGridDesign', () => {
  const checker = makeGridDesign({
    id: 'test-checker',
    name: 'Тест',
    colWidthsMm: uniform(4, 30),
    rowHeightsMm: uniform(4, 30),
    at: (col, row) => ((col + row) % 2 === 0 ? 'walnut' : 'maple'),
  })

  it('схлопывает одинаковые ряды в одну панель', () => {
    expect(checker.panels).toHaveLength(2)
    expect(checker.rows).toHaveLength(4)
    expect(checker.rows.map((r) => r.panelId)).toEqual(['P1', 'P2', 'P1', 'P2'])
  })

  it('все панели рядов одной ширины, поэтому доска не рваная', () => {
    const widths = checker.panels.map(panelWidthMm)
    expect(new Set(widths).size).toBe(1)
    expect(widths[0]).toBe(120)
  })

  it('габарит доски выводится из сетки', () => {
    expect(checker.board).toEqual({ targetWidthMm: 120, targetLengthMm: 120, thicknessMm: 40 })
  })

  it('палитра содержит только использованные породы в порядке справочника', () => {
    expect(checker.species).toEqual(['maple', 'walnut'])
  })

  it('проходит validate без ошибок и компилируется в ожидаемое число ячеек', () => {
    expect(hasErrors(validate(checker, OPTS))).toBe(false)
    expect(compile(checker).cells).toHaveLength(16)
  })

  it('поддерживает разную ширину колонок и разную высоту рядов', () => {
    const design = makeGridDesign({
      id: 'test-pinstripe',
      name: 'Тест',
      colWidthsMm: [46, 8, 46],
      rowHeightsMm: [30, 8, 30],
      at: (col) => (col === 1 ? 'wenge' : 'maple'),
    })
    expect(design.panels).toHaveLength(1)
    expect(design.board.targetWidthMm).toBe(100)
    expect(design.board.targetLengthMm).toBe(68)
    expect(design.rows.map((r) => r.thicknessMm)).toEqual([30, 8, 30])
    expect(hasErrors(validate(design, OPTS))).toBe(false)
  })

  it('уважает заданную толщину доски', () => {
    const design = makeGridDesign({
      id: 'test-thick', name: 'Тест',
      colWidthsMm: uniform(2, 30), rowHeightsMm: uniform(2, 30),
      at: () => 'maple', thicknessMm: 50,
    })
    expect(design.board.thicknessMm).toBe(50)
  })
})

import { describe, expect, it } from 'vitest'
import { safeFileName } from './filename'

describe('safeFileName', () => {
  it('сохраняет кириллицу и пробелы превращает в дефисы', () => {
    expect(safeFileName('Моя доска', 'png')).toBe('Моя-доска.png')
  })
  it('вычищает символы, недопустимые в имени файла', () => {
    expect(safeFileName('a/b\\c:d*e?f"g<h>i|j', 'svg')).toBe('a-b-c-d-e-f-g-h-i-j.svg')
  })
  it('схлопывает повторы и обрезает края', () => {
    expect(safeFileName('  ---доска---  ', 'csv')).toBe('доска.csv')
  })
  it('пустое имя даёт нейтральное', () => {
    expect(safeFileName('   ', 'pdf')).toBe('endgrain.pdf')
  })
  it('ограничивает длину', () => {
    expect(safeFileName('я'.repeat(200), 'pdf').length).toBeLessThanOrEqual(64 + 4)
  })
})

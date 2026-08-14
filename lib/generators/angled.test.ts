import { describe, expect, it } from 'vitest'
import { compile, isSliceRef, type Cell } from '@/lib/engine'
import { chevronDesign, diamondDesign, tumblingDesign } from './angled'
import { randomGenome } from './genome'

/**
 * Сцепка V: на стыке двух соседних наклонных колонок правая граница ячейки левой колонки
 * должна совпадать с левой границей ячейки правой колонки - иначе шеврон "разъезжается".
 * Проверяем это численно на скомпилированной модели (по вершинам многоугольников на самом
 * шве), а не доверяем формуле offsetMm на слово.
 */
function seamYs(cells: readonly Cell[], elementIndex: number, seamXMm: number): number[] {
  const ys: number[] = []
  for (const cell of cells) {
    if (cell.origin.elementIndex !== elementIndex || !cell.poly) continue
    for (const [x, y] of cell.poly) {
      if (Math.abs(x - seamXMm) < 1e-6) ys.push(Math.round(y * 1000) / 1000)
    }
  }
  return [...new Set(ys)].sort((a, b) => a - b)
}

describe('lib/generators/angled: сцепка V на всех колонках', () => {
  it('chevron: колонки MAIN образуют непрерывную линию на каждом стыке', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const design = chevronDesign(randomGenome('chevron', seed))
      const model = compile(design)
      const main = design.panels.find((p) => p.id === 'MAIN')!
      let xMm = 0
      const seams: number[] = []
      for (const el of main.elements) {
        xMm += el.kind === 'strip' ? el.widthMm : el.thicknessMm
        seams.push(xMm)
      }
      seams.pop() // последний "стык" - правый край доски, не между колонками
      seams.forEach((seamXMm, k) => {
        const left = seamYs(model.cells, k, seamXMm)
        const right = seamYs(model.cells, k + 1, seamXMm)
        expect(left.length, `сид ${seed}, шов ${k}`).toBeGreaterThan(0)
        expect(right, `сид ${seed}, шов ${k}`).toEqual(left)
      })
    }
  })

  it('chevron: соседние колонки имеют разный знак угла', () => {
    const design = chevronDesign(randomGenome('chevron', 3))
    const refs = design.panels.find((p) => p.id === 'MAIN')!.elements.filter(isSliceRef)
    for (let i = 1; i < refs.length; i += 1) {
      expect(Math.sign(refs[i]!.angleDeg)).not.toBe(Math.sign(refs[i - 1]!.angleDeg))
    }
  })

  it('diamond: соседние ряды ссылаются на разные панели с противоположным знаком угла', () => {
    const design = diamondDesign(randomGenome('diamond', 4))
    for (let i = 0; i < design.rows.length; i += 1) {
      expect(design.rows[i]!.panelId).toBe(i % 2 === 0 ? 'MAIN' : 'MAIN2')
    }
    const up = design.panels.find((p) => p.id === 'MAIN')!.elements.filter(isSliceRef)
    const down = design.panels.find((p) => p.id === 'MAIN2')!.elements.filter(isSliceRef)
    expect(up.length).toBe(down.length)
    for (let i = 0; i < up.length; i += 1) {
      // Одна и та же колонка х-позиции у двух панелей смотрит в противоположные стороны:
      // ряды, ссылающиеся на разные панели, дают встречные V на одной и той же х-позиции.
      expect(Math.sign(up[i]!.angleDeg)).toBe(-Math.sign(down[i]!.angleDeg))
    }
  })

  it('tumbling: три породы, цикл из трёх фаз угла', () => {
    const design = tumblingDesign(randomGenome('tumbling', 9))
    expect(design.species.length).toBe(3)
    const refs = design.panels.find((p) => p.id === 'MAIN')!.elements.filter(isSliceRef)
    const panelIds = new Set(refs.map((r) => r.panelId))
    expect(panelIds.size).toBe(Math.min(3, refs.length))
  })

  it('нулевая площадь ячеек не пропадает и не наслаивается: сумма площадей равна ширине на толщину ряда', () => {
    const design = chevronDesign(randomGenome('chevron', 11))
    const model = compile(design)
    const byRow = new Map<string, Cell[]>()
    for (const cell of model.cells) {
      const list = byRow.get(cell.origin.rowId) ?? []
      list.push(cell)
      byRow.set(cell.origin.rowId, list)
    }
    const main = design.panels.find((p) => p.id === 'MAIN')!
    const mainWidthMm = main.elements.reduce((s, el) => s + (el.kind === 'strip' ? el.widthMm : el.thicknessMm), 0)
    for (const [rowId, cells] of byRow) {
      const row = design.rows.find((r) => r.id === rowId)!
      const totalArea = cells.reduce((s, c) => {
        if (!c.poly) return s + c.widthMm * c.heightMm
        // Площадь по формуле шнурования, тот же метод, что и polygonAreaMm2.
        let area = 0
        for (let i = 0; i < c.poly.length; i += 1) {
          const [x1, y1] = c.poly[i]!
          const [x2, y2] = c.poly[(i + 1) % c.poly.length]!
          area += x1 * y2 - x2 * y1
        }
        return s + Math.abs(area) / 2
      }, 0)
      expect(totalArea).toBeCloseTo(mainWidthMm * row.thicknessMm, 3)
    }
  })
})

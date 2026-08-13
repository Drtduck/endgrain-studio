import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { baseDesign, colBandsMm, compile, rowBandsMm, stripsPanel } from '@/lib/engine'
import { makeCheckerboard } from '@/lib/designs/samples'
import { BoardSvg } from './BoardSvg'

/** Панель P с одним угловым SliceRef на Q, вклеенным как единственная колонка ряда r1. */
function angledDesign() {
  return baseDesign({
    panels: [
      stripsPanel('Q', ['walnut', 'maple'], 12),
      { id: 'P', elements: [{ kind: 'sliceRef', panelId: 'Q', thicknessMm: 10, angleDeg: 30, offsetMm: 0 }] },
    ],
    rows: [{ id: 'r1', panelId: 'P', thicknessMm: 12, angleDeg: 0, flip: false, mirror: false, trimMm: 5 }],
  })
}

describe('BoardSvg', () => {
  it('renders one rect per cell with the species colour', () => {
    const model = compile(makeCheckerboard({ cols: 2, rows: 2 }))
    const { container } = render(<BoardSvg model={model} locale="ru" />)
    const rects = container.querySelectorAll('rect[data-cell]')
    expect(rects).toHaveLength(4)
    expect(rects[0]?.getAttribute('fill')).toBe('#5b3a24')
    expect(rects[1]?.getAttribute('fill')).toBe('#e3caa1')
  })

  it('uses a millimetre viewBox so the SVG scales without recomputation', () => {
    const model = compile(makeCheckerboard({ cols: 2, rows: 2 }))
    const { container } = render(<BoardSvg model={model} locale="ru" />)
    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 60 60')
  })

  it('localizes the aria-label instead of hardcoding Russian', () => {
    const model = compile(makeCheckerboard({ cols: 2, rows: 2 }))
    const ru = render(<BoardSvg model={model} locale="ru" />)
    expect(ru.container.querySelector('svg')?.getAttribute('aria-label')).toBe('превью доски')
    const en = render(<BoardSvg model={model} locale="en" />)
    expect(en.container.querySelector('svg')?.getAttribute('aria-label')).toBe('board preview')
  })

  it('обводит наведённую и выбранную ячейку токеном выделения, не меняя заливку', () => {
    const model = compile(makeCheckerboard({ cols: 2, rows: 2 }))
    const { container } = render(
      <BoardSvg model={model} locale="ru" highlightCellId="r0:1" selectedCellId="r1:0" />,
    )
    const hovered = container.querySelector('rect[data-cell="r0:1"]')
    const selected = container.querySelector('rect[data-cell="r1:0"]')
    const plain = container.querySelector('rect[data-cell="r0:0"]')
    expect(hovered?.getAttribute('stroke')).toBe('var(--selection)')
    expect(selected?.getAttribute('stroke')).toBe('var(--selection)')
    expect(selected?.hasAttribute('stroke-width')).toBe(true)
    expect(hovered?.hasAttribute('stroke-width')).toBe(true)
    expect(plain?.hasAttribute('stroke')).toBe(false)
    expect(hovered?.getAttribute('fill')).toBe('#e3caa1')
  })

  it('ужимает ячейку на клеевой зазор 2px, переведённый в мм координаты доски', () => {
    const model = compile(makeCheckerboard({ cols: 2, rows: 2 }))
    const { container } = render(<BoardSvg model={model} locale="ru" />)
    const rect = container.querySelector('rect[data-cell="r0:0"]')
    const cell = model.cells.find((c) => c.id === 'r0:0')
    expect(cell).toBeDefined()
    const gapMm = 2 / (640 / 60)
    expect(Number(rect?.getAttribute('width'))).toBeCloseTo((cell?.widthMm ?? 0) - gapMm, 5)
    expect(Number(rect?.getAttribute('height'))).toBeCloseTo((cell?.heightMm ?? 0) - gapMm, 5)
    expect(Number(rect?.getAttribute('x'))).toBeCloseTo((cell?.xMm ?? 0) + gapMm / 2, 5)
    expect(Number(rect?.getAttribute('y'))).toBeCloseTo((cell?.yMm ?? 0) + gapMm / 2, 5)
  })

  it('без rowLabels подписей рядов нет', () => {
    const model = compile(makeCheckerboard({ cols: 2, rows: 2 }))
    const { container } = render(<BoardSvg model={model} locale="ru" />)
    expect(container.querySelectorAll('[data-testid="row-label"]')).toHaveLength(0)
  })

  it('с rowLabels рисует один текстовый элемент на ряд по порядку сверху вниз', () => {
    const design = makeCheckerboard({ cols: 2, rows: 3 })
    const model = compile(design)
    const bands = rowBandsMm(design)
    const { container } = render(<BoardSvg model={model} locale="ru" rowLabels={bands} />)
    const labels = container.querySelectorAll('[data-testid="row-label"]')
    expect(labels).toHaveLength(bands.length)
    expect(Array.from(labels).map((el) => el.textContent)).toEqual(
      bands.map((_, i) => String(i + 1)),
    )
    expect(labels[0]?.getAttribute('text-anchor')).toBe('end')
    expect(labels[0]?.getAttribute('fill')).toBe('var(--text-muted)')
    expect(labels[0]?.classList.contains('font-mono')).toBe(true)
  })

  it('номер ряда доступен кликом и с клавиатуры', () => {
    const design = makeCheckerboard({ cols: 2, rows: 2 })
    const model = compile(design)
    const bands = rowBandsMm(design)
    const { container } = render(<BoardSvg model={model} locale="ru" rowLabels={bands} />)
    const first = container.querySelector('[data-testid="row-label"]')
    expect(first?.getAttribute('data-row')).toBe(bands[0]?.id)
    expect(first?.getAttribute('role')).toBe('button')
    expect(first?.getAttribute('tabindex')).toBe('0')
  })

  it('без colLabels подписей колонок нет', () => {
    const model = compile(makeCheckerboard({ cols: 2, rows: 2 }))
    const { container } = render(<BoardSvg model={model} locale="ru" />)
    expect(container.querySelectorAll('[data-testid="col-label"]')).toHaveLength(0)
  })

  it('с colLabels рисует один текстовый элемент на колонку слева направо', () => {
    const design = makeCheckerboard({ cols: 3, rows: 2 })
    const model = compile(design)
    const bands = colBandsMm(design)
    const { container } = render(<BoardSvg model={model} locale="ru" colLabels={bands} />)
    const labels = container.querySelectorAll('[data-testid="col-label"]')
    expect(labels).toHaveLength(bands.length)
    expect(Array.from(labels).map((el) => el.textContent)).toEqual(bands.map((_, i) => String(i + 1)))
  })

  it('без touchedCellIds подсветки нетронутых ячеек нет', () => {
    const model = compile(makeCheckerboard({ cols: 2, rows: 2 }))
    const { container } = render(<BoardSvg model={model} locale="ru" />)
    expect(container.querySelectorAll('[data-testid="cell-untouched"]')).toHaveLength(0)
  })

  it('touchedCellIds подсвечивает только нетронутые ячейки', () => {
    const model = compile(makeCheckerboard({ cols: 2, rows: 2 }))
    const { container } = render(
      <BoardSvg model={model} locale="ru" touchedCellIds={new Set(['r0:0'])} />,
    )
    expect(container.querySelectorAll('[data-testid="cell-untouched"]')).toHaveLength(model.cells.length - 1)
  })

  it('прямой узор рисуется только rect, без единого polygon', () => {
    const model = compile(makeCheckerboard({ cols: 2, rows: 2 }))
    const { container } = render(<BoardSvg model={model} locale="ru" />)
    expect(container.querySelectorAll('rect[data-cell]')).toHaveLength(model.cells.length)
    expect(container.querySelectorAll('polygon[data-cell]')).toHaveLength(0)
  })

  it('угловой узор рисует ячейки с poly через polygon, а не rect', () => {
    const model = compile(angledDesign())
    expect(model.cells.some((c) => c.poly !== undefined)).toBe(true)
    const { container } = render(<BoardSvg model={model} locale="ru" />)
    const polygons = container.querySelectorAll('polygon[data-cell]')
    const rects = container.querySelectorAll('rect[data-cell]')
    expect(polygons.length).toBe(model.cells.length)
    expect(rects.length).toBe(0)
    for (const p of polygons) {
      const points = p.getAttribute('points') ?? ''
      const coords = points.trim().split(/\s+/).filter(Boolean)
      expect(coords.length).toBeGreaterThanOrEqual(3)
      for (const pair of coords) {
        const [x, y] = pair.split(',').map(Number)
        expect(Number.isFinite(x)).toBe(true)
        expect(Number.isFinite(y)).toBe(true)
      }
    }
  })

  it('угловая ячейка обводится выделением так же, как прямая', () => {
    const model = compile(angledDesign())
    const firstId = model.cells[0]?.id
    expect(firstId).toBeDefined()
    const { container } = render(<BoardSvg model={model} locale="ru" selectedCellId={firstId ?? null} />)
    const polygon = container.querySelector(`polygon[data-cell="${firstId}"]`)
    expect(polygon?.getAttribute('stroke')).toBe('var(--selection)')
  })
})

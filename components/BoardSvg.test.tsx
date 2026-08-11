import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { compile, rowBandsMm } from '@/lib/engine'
import { makeCheckerboard } from '@/lib/designs/samples'
import { BoardSvg } from './BoardSvg'

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
})

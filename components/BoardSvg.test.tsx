import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { compile } from '@/lib/engine'
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
})

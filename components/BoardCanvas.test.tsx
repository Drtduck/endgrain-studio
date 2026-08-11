import { describe, it, expect, beforeEach } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { makeCheckerboard } from '@/lib/designs/samples'
import { baseDesign } from '@/lib/engine'
import { useStudio } from '@/lib/store/studio'
import { BoardCanvas } from './BoardCanvas'

describe('BoardCanvas', () => {
  beforeEach(() => useStudio.getState().resetStudio(baseDesign()))

  it('красит ячейку на месте, когда панель используется одним рядом', () => {
    const { container } = render(<BoardCanvas />)
    useStudio.getState().setActiveSpecies('padauk')
    const rect = container.querySelector('rect[data-cell="r1:0"]')
    expect(rect).not.toBe(null)
    fireEvent.pointerDown(rect as Element, { bubbles: true })
    expect(useStudio.getState().history.present.panels[0]?.elements[0]).toMatchObject({ speciesId: 'padauk' })
  })

  it('открывает подтверждение вместо покраски, когда панель переиспользуется', () => {
    useStudio.getState().resetStudio(makeCheckerboard({ cols: 2, rows: 4 }))
    const { container } = render(<BoardCanvas />)
    useStudio.getState().setActiveSpecies('padauk')
    fireEvent.pointerDown(container.querySelector('rect[data-cell="r0:0"]') as Element, { bubbles: true })
    expect(useStudio.getState().pendingFork?.cellId).toBe('r0:0')
  })

  it('запоминает наведённую ячейку и забывает её при уходе курсора', () => {
    const { container } = render(<BoardCanvas />)
    const rect = container.querySelector('rect[data-cell="r1:1"]') as Element
    fireEvent.pointerOver(rect, { bubbles: true })
    expect(useStudio.getState().hoveredCellId).toBe('r1:1')
    fireEvent.pointerLeave(container.querySelector('[data-testid="board-canvas"]') as Element)
    expect(useStudio.getState().hoveredCellId).toBe(null)
  })

  it('клик мимо ячейки ничего не ломает', () => {
    const { container } = render(<BoardCanvas />)
    const wrapper = container.querySelector('[data-testid="board-canvas"]') as Element
    expect(() => fireEvent.pointerDown(wrapper, { bubbles: true })).not.toThrow()
    expect(useStudio.getState().pendingFork).toBe(null)
  })

  it('рисует номер для каждого ряда доски', () => {
    useStudio.getState().resetStudio(makeCheckerboard({ cols: 2, rows: 4 }))
    const { container } = render(<BoardCanvas />)
    const rowCount = useStudio.getState().history.present.rows.length
    const labels = container.querySelectorAll('[data-testid="row-label"]')
    expect(labels).toHaveLength(rowCount)
    expect(Array.from(labels).map((el) => el.textContent)).toEqual(
      Array.from({ length: rowCount }, (_, i) => String(i + 1)),
    )
  })

  it('рисует подпись под доской с числом рядов и габаритом', () => {
    useStudio.getState().resetStudio(makeCheckerboard({ cols: 2, rows: 4 }))
    const { getByTestId } = render(<BoardCanvas />)
    const rowCount = useStudio.getState().history.present.rows.length
    const caption = getByTestId('board-caption')
    expect(caption.textContent).toContain(`× ${rowCount} ·`)
  })
})

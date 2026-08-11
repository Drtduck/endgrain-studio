import { describe, it, expect, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { makeCheckerboard } from '@/lib/designs/samples'
import { useStudio } from '@/lib/store/studio'
import { StudioShell } from './StudioShell'

describe('StudioShell', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.location.hash = ''
    // rows: 4 (не 2), чтобы обе панели переиспользовались (usageCount > 1) и клик по ячейке
    // открывал форк-диалог, а не красил панель на месте.
    useStudio.getState().resetStudio(makeCheckerboard({ cols: 2, rows: 4 }))
  })

  it('собирает холст, палитру, инспекторы, параметры, счётчик и проверки', () => {
    const { container } = render(<StudioShell />)
    expect(container.querySelector('[data-testid="board-canvas"]')).not.toBe(null)
    expect(screen.getByTestId('species-walnut')).toBeDefined()
    expect(screen.getByTestId('panel-A')).toBeDefined()
    expect(screen.getByTestId('row-r0')).toBeDefined()
    expect(screen.getByTestId('board-thickness')).toBeDefined()
    expect(screen.getByTestId('undo')).toBeDefined()
    expect(screen.getByText('Сложность проекта')).toBeDefined()
    expect(screen.getByText('Проверки изготовимости')).toBeDefined()
  })

  it('переключение языка переводит весь интерфейс', () => {
    render(<StudioShell />)
    fireEvent.click(screen.getByText('EN'))
    expect(screen.getByText('Project complexity')).toBeDefined()
    expect(screen.getByText('Board rows')).toBeDefined()
  })

  it('переключение единиц меняет числа в счётчике сложности', () => {
    render(<StudioShell />)
    expect(screen.getByText(/Габарит: 60/)).toBeDefined()
    fireEvent.click(screen.getByTestId('unit-in'))
    // Ширина панели совпадает с шириной доски (иначе сработал бы diag.RAGGED_BOARD), поэтому
    // без префикса "Габарит:" запрос находит эту же цифру ещё и в PanelInspector.
    expect(screen.getByText(/Габарит: 2\.36"/)).toBeDefined()
  })

  it('покраска через холст и отмена возвращают исходный цвет', () => {
    const { container } = render(<StudioShell />)
    fireEvent.click(screen.getByTestId('species-padauk'))
    const rect = container.querySelector('rect[data-cell="r0:0"]') as Element
    const before = rect.getAttribute('fill')
    fireEvent.pointerDown(rect, { bubbles: true })
    fireEvent.click(screen.getByTestId('fork-confirm'))
    expect(container.querySelector('rect[data-cell="r0:0"]')?.getAttribute('fill')).toBe('#a8422a')
    fireEvent.click(screen.getByTestId('undo'))
    expect(container.querySelector('rect[data-cell="r0:0"]')?.getAttribute('fill')).toBe(before)
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { baseDesign } from '@/lib/engine'
import { useStudio } from '@/lib/store/studio'
import { RowInspector } from './RowInspector'

const rows = () => useStudio.getState().history.present.rows

describe('RowInspector', () => {
  beforeEach(() => useStudio.getState().resetStudio(baseDesign()))

  it('перечисляет ряды документа', () => {
    render(<RowInspector />)
    expect(screen.getByTestId('row-r1')).toBeDefined()
    expect(screen.getByTestId('row-r2')).toBeDefined()
  })

  it('меняет толщину среза и торцевой припуск', () => {
    render(<RowInspector />)
    const thickness = screen.getByTestId('row-r1-thickness')
    fireEvent.change(thickness, { target: { value: '35' } })
    fireEvent.blur(thickness)
    const trim = screen.getByTestId('row-r1-trim')
    fireEvent.change(trim, { target: { value: '8' } })
    fireEvent.blur(trim)
    expect(rows()[0]).toMatchObject({ thicknessMm: 35, trimMm: 8 })
  })

  it('переставляет ряд на другую панель', () => {
    render(<RowInspector />)
    fireEvent.change(screen.getByTestId('row-r1-panel'), { target: { value: 'B' } })
    expect(rows()[0]?.panelId).toBe('B')
  })

  it('переключает переворот и зеркало', () => {
    render(<RowInspector />)
    fireEvent.click(screen.getByTestId('row-r1-flip'))
    fireEvent.click(screen.getByTestId('row-r1-mirror'))
    expect(rows()[0]).toMatchObject({ flip: true, mirror: true })
    expect((screen.getByTestId('row-r1-flip') as HTMLInputElement).checked).toBe(true)
  })

  it('добавляет ряд копией текущего и удаляет ряд', () => {
    render(<RowInspector />)
    fireEvent.click(screen.getByTestId('row-r1-add'))
    expect(rows()).toHaveLength(3)
    fireEvent.click(screen.getByTestId('row-r1-remove'))
    expect(rows().map((r) => r.id)).not.toContain('r1')
  })

  it('переставляет ряды кнопками', () => {
    render(<RowInspector />)
    fireEvent.click(screen.getByTestId('row-r1-down'))
    expect(rows().map((r) => r.id)).toEqual(['r2', 'r1'])
  })

  it('показывает подсказку, когда рядов нет, и умеет добавить первый', () => {
    useStudio.getState().resetStudio(baseDesign({ rows: [] }))
    render(<RowInspector />)
    expect(screen.getByText('В доске пока нет рядов')).toBeDefined()
    fireEvent.click(screen.getByTestId('rows-add'))
    expect(rows()).toHaveLength(1)
  })

  it('переводит подписи', () => {
    useStudio.getState().setLocale('en')
    render(<RowInspector />)
    expect(screen.getByText('Board rows')).toBeDefined()
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { baseDesign } from '@/lib/engine'
import { useStudio } from '@/lib/store/studio'
import { HistoryControls } from './HistoryControls'

const kerf = () => useStudio.getState().history.present.kerfMm

describe('HistoryControls', () => {
  beforeEach(() => useStudio.getState().resetStudio(baseDesign()))

  it('обе кнопки выключены, пока правок не было', () => {
    render(<HistoryControls />)
    expect((screen.getByTestId('undo') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('redo') as HTMLButtonElement).disabled).toBe(true)
  })

  it('кнопки отменяют и возвращают правку', () => {
    render(<HistoryControls />)
    // Правка из стора минует React-обработчик события, поэтому без act() состояние
    // не успевает синхронно долететь до рендера кнопок (см. PanelInspector.test.tsx).
    act(() => useStudio.getState().setKerfMm(7))
    fireEvent.click(screen.getByTestId('undo'))
    expect(kerf()).toBe(3)
    fireEvent.click(screen.getByTestId('redo'))
    expect(kerf()).toBe(7)
  })

  it('ctrl+z отменяет, shift+ctrl+z возвращает', () => {
    render(<HistoryControls />)
    act(() => useStudio.getState().setKerfMm(7))
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    expect(kerf()).toBe(3)
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true })
    expect(kerf()).toBe(7)
  })

  it('cmd+z работает на macOS', () => {
    render(<HistoryControls />)
    act(() => useStudio.getState().setKerfMm(7))
    fireEvent.keyDown(window, { key: 'z', metaKey: true })
    expect(kerf()).toBe(3)
  })

  it('ctrl+y тоже возвращает правку', () => {
    render(<HistoryControls />)
    act(() => {
      useStudio.getState().setKerfMm(7)
      useStudio.getState().undo()
    })
    fireEvent.keyDown(window, { key: 'y', ctrlKey: true })
    expect(kerf()).toBe(7)
  })

  it('не перехватывает отмену внутри поля ввода', () => {
    render(
      <>
        <HistoryControls />
        <input data-testid="поле" />
      </>,
    )
    act(() => useStudio.getState().setKerfMm(7))
    const field = screen.getByTestId('поле')
    field.focus()
    fireEvent.keyDown(field, { key: 'z', ctrlKey: true, bubbles: true })
    expect(kerf()).toBe(7)
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StudioToolbar } from './StudioToolbar'
import { useStudio } from '@/lib/store/studio'

describe('StudioToolbar', () => {
  beforeEach(() => {
    useStudio.getState().setUnit('mm')
    useStudio.getState().setView('editor')
  })

  it('несёт вкладки, единицы, отмену с повтором и сброс', () => {
    render(<StudioToolbar />)
    expect(screen.getByTestId('studio-toolbar')).toBeDefined()
    expect(screen.getByTestId('tab-editor')).toBeDefined()
    expect(screen.getByTestId('unit-mm')).toBeDefined()
    expect(screen.getByTestId('undo')).toBeDefined()
    expect(screen.getByTestId('redo')).toBeDefined()
    expect(screen.getByTestId('reset-studio')).toBeDefined()
  })

  it('переключатель единиц меняет стор', () => {
    render(<StudioToolbar />)
    fireEvent.click(screen.getByTestId('unit-in'))
    expect(useStudio.getState().unit).toBe('in')
  })

  it('отмена и повтор видны всегда, даже когда откатывать нечего', () => {
    // Кнопки не исчезают на пустой истории, иначе панель прыгает от раздела к разделу.
    render(<StudioToolbar />)
    expect(screen.getByTestId('undo')).toBeDisabled()
    expect(screen.getByTestId('redo')).toBeDisabled()
  })
})

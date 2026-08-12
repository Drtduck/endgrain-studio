import { describe, it, expect, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { baseDesign } from '@/lib/engine'
import { useStudio } from '@/lib/store/studio'
import { ResetButton } from './ResetButton'

describe('ResetButton', () => {
  beforeEach(() => {
    useStudio.getState().resetStudio(baseDesign())
    window.localStorage.clear()
  })

  it('не сбрасывает без подтверждения', () => {
    useStudio.getState().setKerfMm(5)
    render(<ResetButton />)
    fireEvent.click(screen.getByTestId('reset-studio'))
    expect(screen.getByTestId('reset-confirm-dialog')).toBeDefined()
    expect(useStudio.getState().history.present.kerfMm).toBe(5)
  })

  it('отмена ничего не стирает', () => {
    useStudio.getState().setKerfMm(5)
    render(<ResetButton />)
    fireEvent.click(screen.getByTestId('reset-studio'))
    fireEvent.click(screen.getByTestId('reset-cancel'))
    expect(screen.queryByTestId('reset-confirm-dialog')).toBe(null)
    expect(useStudio.getState().history.present.kerfMm).toBe(5)
  })

  it('подтверждение полностью сбрасывает документ, историю и выбор', () => {
    useStudio.getState().setKerfMm(5)
    useStudio.getState().selectRow('r1')
    useStudio.getState().selectStrip(0)
    useStudio.getState().markCellTouched('r1:0')
    render(<ResetButton />)
    fireEvent.click(screen.getByTestId('reset-studio'))
    fireEvent.click(screen.getByTestId('reset-confirm'))

    const s = useStudio.getState()
    expect(s.history.past).toHaveLength(0)
    expect(s.history.future).toHaveLength(0)
    expect(s.selectedRowId).toBe(null)
    expect(s.selectedStripIndex).toBe(null)
    expect(s.touchedCellIds.size).toBe(0)
    expect(s.documentTouched).toBe(false)
    expect(screen.queryByTestId('reset-confirm-dialog')).toBe(null)
  })
})

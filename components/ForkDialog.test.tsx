import { describe, it, expect, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { compile } from '@/lib/engine'
import { makeCheckerboard } from '@/lib/designs/samples'
import { useStudio } from '@/lib/store/studio'
import { ForkDialog } from './ForkDialog'

function openFork(): void {
  const design = makeCheckerboard({ cols: 2, rows: 4 })
  useStudio.getState().resetStudio(design)
  useStudio.getState().setActiveSpecies('padauk')
  const cell = compile(design).cells.find((c) => c.id === 'r0:0')
  if (!cell) throw new Error('ячейка r0:0 не найдена')
  useStudio.getState().paintCell(cell)
}

describe('ForkDialog', () => {
  beforeEach(() => useStudio.getState().resetStudio(makeCheckerboard({ cols: 2, rows: 4 })))

  it('не рисуется, пока нет отложенного форка', () => {
    const { container } = render(<ForkDialog />)
    expect(container.querySelector('[role="dialog"]')).toBe(null)
  })

  it('показывает цену разветвления в склейках, резах и погонаже', () => {
    openFork()
    render(<ForkDialog />)
    expect(screen.getByRole('dialog')).toBeDefined()
    const cost = useStudio.getState().pendingFork?.cost
    expect(screen.getByTestId('fork-glueups').textContent).toContain(String(cost?.extraGlueUps))
    expect(screen.getByTestId('fork-cuts').textContent).toContain(String(cost?.extraCuts))
    expect(screen.getAllByTestId('fork-lumber').length).toBeGreaterThan(0)
  })

  it('подтверждение применяет правку и закрывает диалог', () => {
    openFork()
    render(<ForkDialog />)
    fireEvent.click(screen.getByTestId('fork-confirm'))
    expect(useStudio.getState().pendingFork).toBe(null)
    expect(compile(useStudio.getState().history.present).cells.find((c) => c.id === 'r0:0')?.speciesId).toBe('padauk')
  })

  it('отмена закрывает диалог, не трогая документ', () => {
    openFork()
    const before = useStudio.getState().history.present
    render(<ForkDialog />)
    fireEvent.click(screen.getByTestId('fork-cancel'))
    expect(useStudio.getState().pendingFork).toBe(null)
    expect(useStudio.getState().history.present).toBe(before)
  })

  it('Escape отменяет разветвление', () => {
    openFork()
    render(<ForkDialog />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useStudio.getState().pendingFork).toBe(null)
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { baseDesign } from '@/lib/engine'
import { useStudio } from '@/lib/store/studio'
import { SpeciesPalette } from './SpeciesPalette'

describe('SpeciesPalette', () => {
  beforeEach(() => useStudio.getState().resetStudio(baseDesign()))

  it('рисует все 16 пород справочника', () => {
    const { container } = render(<SpeciesPalette />)
    expect(container.querySelectorAll('[data-testid^="species-"]')).toHaveLength(16)
  })

  it('клик по образцу делает породу активной', () => {
    render(<SpeciesPalette />)
    fireEvent.click(screen.getByTestId('species-padauk'))
    expect(useStudio.getState().activeSpeciesId).toBe('padauk')
  })

  it('помечает активную породу через aria-pressed и показывает её имя на языке интерфейса', () => {
    const { rerender } = render(<SpeciesPalette />)
    expect(screen.getByTestId('species-walnut').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Выбрана: Орех')).toBeDefined()
    useStudio.getState().setLocale('en')
    rerender(<SpeciesPalette />)
    expect(screen.getByText('Selected: Black walnut')).toBeDefined()
  })
})

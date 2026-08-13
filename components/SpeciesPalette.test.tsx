import { describe, it, expect, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { baseDesign, stripsPanel } from '@/lib/engine'
import { useStudio } from '@/lib/store/studio'
import { SpeciesPalette } from './SpeciesPalette'

const twoSpeciesDesign = () =>
  baseDesign({
    panels: [stripsPanel('A', ['walnut', 'maple'], 25)],
    rows: [{ id: 'r1', panelId: 'A', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 }],
  })

describe('SpeciesPalette', () => {
  beforeEach(() => {
    useStudio.getState().resetStudio(baseDesign())
    useStudio.getState().setLocale('ru')
    useStudio.getState().setUnit('mm')
  })

  it('рисует все 16 пород справочника', () => {
    const { container } = render(<SpeciesPalette />)
    expect(container.querySelectorAll('[data-testid^="species-"]')).toHaveLength(16)
  })

  it('клик по образцу делает породу активной', () => {
    render(<SpeciesPalette />)
    fireEvent.click(screen.getByTestId('species-padauk'))
    expect(useStudio.getState().activeSpeciesId).toBe('padauk')
  })

  it('показывает подпись кисти на языке интерфейса', () => {
    const { rerender } = render(<SpeciesPalette />)
    expect(screen.getByTestId('species-walnut').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Кисть: Орех')).toBeDefined()
    useStudio.getState().setLocale('en')
    rerender(<SpeciesPalette />)
    expect(screen.getByText('Brush: Black walnut')).toBeDefined()
  })

  it('data-used стоит только у пород, реально присутствующих в модели', () => {
    useStudio.getState().resetStudio(twoSpeciesDesign())
    render(<SpeciesPalette />)
    expect(screen.getByTestId('species-walnut').getAttribute('data-used')).toBe('true')
    expect(screen.getByTestId('species-maple').getAttribute('data-used')).toBe('true')
    expect(screen.getByTestId('species-padauk').getAttribute('data-used')).toBeNull()
  })

  it('клик по неиспользуемой породе меняет кисть, но не помечает её data-used', () => {
    useStudio.getState().resetStudio(twoSpeciesDesign())
    render(<SpeciesPalette />)
    fireEvent.click(screen.getByTestId('species-padauk'))
    expect(useStudio.getState().activeSpeciesId).toBe('padauk')
    expect(screen.getByTestId('species-padauk').getAttribute('data-used')).toBeNull()
    expect(screen.getByTestId('species-padauk').getAttribute('aria-pressed')).toBe('true')
  })

  it('счётчик "в проекте" равен числу уникальных пород в модели', () => {
    useStudio.getState().resetStudio(twoSpeciesDesign())
    render(<SpeciesPalette />)
    expect(screen.getByText('В проекте: 2')).toBeDefined()
  })

  it('показывает подсказку', () => {
    render(<SpeciesPalette />)
    expect(screen.getByText(/Выберите породу/)).toBeDefined()
  })

  it('сетка свотчей выстроена в 4 колонки', () => {
    const { container } = render(<SpeciesPalette />)
    expect(container.querySelector('[role="group"]')?.className).toContain('grid-cols-4')
  })

  it('счётчик пород в заголовке равен числу уникальных пород в модели', () => {
    useStudio.getState().resetStudio(twoSpeciesDesign())
    const { container } = render(<SpeciesPalette />)
    const header = container.querySelector('.text-accent')
    expect(header?.textContent).toBe('2')
  })
})

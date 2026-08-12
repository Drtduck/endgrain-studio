import { describe, it, expect, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { POPULATION_SIZE } from '@/lib/generators'
import { makeCheckerboard } from '@/lib/designs/samples'
import { useStudio } from '@/lib/store/studio'
import { GeneratorPanel } from './GeneratorPanel'

describe('GeneratorPanel', () => {
  beforeEach(() => {
    useStudio.getState().resetStudio(makeCheckerboard())
  })

  it('показывает девять превью', () => {
    render(<GeneratorPanel />)
    expect(screen.getByTestId('generator-panel')).toBeTruthy()
    for (let index = 0; index < POPULATION_SIZE; index += 1) {
      const card = screen.getByTestId(`gen-card-${index}`)
      expect(within(card).getAllByRole('img').length).toBeGreaterThan(0)
    }
  })

  it('в каждом превью есть настоящие ячейки доски', () => {
    const { container } = render(<GeneratorPanel />)
    expect(container.querySelectorAll('svg rect').length).toBeGreaterThan(50)
  })

  it('первая девятка одинакова при каждом монтировании', () => {
    // Сравниваем именно сетку карточек, а не весь контейнер: HelpHint рядом с заголовком
    // рисует триггер Base UI Popover с id через React useId, а он не детерминирован между
    // независимыми вызовами render() в одном тесте и не имеет отношения к самой девятке.
    const first = render(<GeneratorPanel />).container.querySelector('[role="group"][aria-label="девять вариантов узора"]')?.innerHTML
    act(() => {
      useStudio.getState().resetStudio(makeCheckerboard())
    })
    const second = render(<GeneratorPanel />).container.querySelector('[role="group"][aria-label="девять вариантов узора"]')?.innerHTML
    expect(second).toBe(first)
    expect(first).toBeTruthy()
  })

  it('перемешать меняет все девять досок', () => {
    const { container } = render(<GeneratorPanel />)
    const before = container.innerHTML
    fireEvent.click(screen.getByTestId('gen-shuffle'))
    expect(container.innerHTML).not.toBe(before)
  })

  it('звёздочка отмечает избранное', () => {
    render(<GeneratorPanel />)
    const star = screen.getByTestId('gen-fav-2')
    expect(star.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(star)
    expect(screen.getByTestId('gen-fav-2').getAttribute('aria-pressed')).toBe('true')
    expect(useStudio.getState().generator?.favouriteIds).toHaveLength(1)
  })

  it('следующее поколение сохраняет избранное в первом слоте', () => {
    const { container } = render(<GeneratorPanel />)
    fireEvent.click(screen.getByTestId('gen-fav-3'))
    const favouriteHtml = screen.getByTestId('gen-card-3').innerHTML
    fireEvent.click(screen.getByTestId('gen-evolve'))
    expect(screen.getByTestId('gen-generation').textContent).toContain('2')
    expect(screen.getByTestId('gen-card-0').innerHTML).toContain(favouriteHtml.slice(0, 200))
    expect(container.querySelectorAll('[data-testid^="gen-card-"]')).toHaveLength(POPULATION_SIZE)
  })

  it('после эволюции избранное сбрасывается', () => {
    render(<GeneratorPanel />)
    fireEvent.click(screen.getByTestId('gen-fav-1'))
    fireEvent.click(screen.getByTestId('gen-evolve'))
    expect(useStudio.getState().generator?.favouriteIds).toEqual([])
  })

  it('фильтр семейств оставляет только выбранное', () => {
    render(<GeneratorPanel />)
    fireEvent.click(screen.getByTestId('gen-family-chaos'))
    const population = useStudio.getState().generator?.population
    expect(population?.familyIds).toEqual(['chaos'])
    for (const item of population?.items ?? []) expect(item.genome.familyId).toBe('chaos')
  })

  it('ползунок колонок переписывает все девять геномов', () => {
    render(<GeneratorPanel />)
    fireEvent.change(screen.getByTestId('gen-cols'), { target: { value: '10' } })
    for (const item of useStudio.getState().generator?.population.items ?? []) {
      // Симметрия квадрата и инкрустация имеют право зажать значение, остальные обязаны его принять.
      expect(item.genome.params.cols).toBeLessThanOrEqual(12)
    }
  })

  it('на чистом документе применяет узор сразу', () => {
    render(<GeneratorPanel />)
    fireEvent.click(screen.getByTestId('gen-apply-4'))
    expect(screen.queryByTestId('generator-confirm-dialog')).toBe(null)
    expect(useStudio.getState().view).toBe('editor')
    expect(useStudio.getState().documentTouched).toBe(true)
  })

  it('поверх правок сначала спрашивает', () => {
    act(() => {
      useStudio.getState().setBoardThicknessMm(55)
    })
    render(<GeneratorPanel />)
    fireEvent.click(screen.getByTestId('gen-apply-0'))
    expect(screen.getByTestId('generator-confirm-dialog')).toBeTruthy()
    fireEvent.click(screen.getByTestId('generator-cancel'))
    expect(screen.queryByTestId('generator-confirm-dialog')).toBe(null)
    fireEvent.click(screen.getByTestId('gen-apply-0'))
    fireEvent.click(screen.getByTestId('generator-confirm'))
    expect(useStudio.getState().view).toBe('editor')
  })

  it('под превью показана честная цена узора', () => {
    render(<GeneratorPanel />)
    expect(within(screen.getByTestId('gen-card-0')).getByText(/склеек/)).toBeTruthy()
  })

  it('популяция переживает уход на другую вкладку', () => {
    const { unmount } = render(<GeneratorPanel />)
    fireEvent.click(screen.getByTestId('gen-shuffle'))
    const seed = useStudio.getState().generator?.population.seed
    unmount()
    render(<GeneratorPanel />)
    expect(useStudio.getState().generator?.population.seed).toBe(seed)
  })
})

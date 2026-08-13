import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { baseDesign, stripsPanel } from '@/lib/engine'
import { useStudio } from '@/lib/store/studio'
import { DiagnosticsPanel } from './DiagnosticsPanel'

// baseDesign() по умолчанию берёт orex/клён (walnut/maple): их усушка расходится на 2.1 п.п.
// при допуске 1.5 п.п., так что в реальном useDerived() (с настоящими данными по породам)
// это уже само по себе даёт SHRINKAGE_MISMATCH. Для сценария "замечаний нет" берём совместимую
// по усушке пару (клён/берёза, расхождение 0.4 п.п.).
const cleanDesign = baseDesign({
  panels: [stripsPanel('A', ['maple', 'birch']), stripsPanel('B', ['birch', 'maple'])],
})

describe('DiagnosticsPanel', () => {
  beforeEach(() => {
    useStudio.getState().resetStudio(cleanDesign)
    useStudio.getState().setLocale('ru')
    useStudio.getState().setUnit('mm')
  })

  it('сообщает, что замечаний нет', () => {
    render(<DiagnosticsPanel />)
    expect(screen.getByText('Замечаний нет, доска изготовима')).toBeDefined()
  })

  it('показывает локализованное сообщение об ошибке и не прячет редактор', () => {
    useStudio.getState().resetStudio(
      baseDesign({ panels: [{ id: 'A', elements: [{ kind: 'strip', speciesId: 'maple', widthMm: 1 }] }] }),
    )
    render(<DiagnosticsPanel />)
    const list = screen.getByTestId('diagnostics-list')
    expect(list.textContent).toContain('не удержится в струбцине')
    expect(screen.getByTestId('diagnostics-counts').textContent).toContain('ошибок')
  })

  it('переводит сообщения на английский', () => {
    useStudio.getState().resetStudio(
      baseDesign({ panels: [{ id: 'A', elements: [{ kind: 'strip', speciesId: 'maple', widthMm: 1 }] }] }),
    )
    useStudio.getState().setLocale('en')
    render(<DiagnosticsPanel />)
    expect(screen.getByTestId('diagnostics-list').textContent).toContain('will not hold in a clamp')
  })

  it('называет породы по-человечески, а не ключами справочника', () => {
    useStudio.getState().resetStudio(
      baseDesign({
        species: ['cherry', 'maple'],
        panels: [stripsPanel('A', ['cherry', 'maple']), stripsPanel('B', ['maple', 'cherry'])],
      }),
    )
    render(<DiagnosticsPanel />)
    const text = screen.getByTestId('diagnostics-list').textContent ?? ''
    expect(text).toContain('вишня')
    expect(text).toContain('клён')
    expect(text).not.toContain('cherry')
    expect(text).not.toContain('maple')
  })

  it('обновляется вслед за правкой документа', () => {
    const { rerender } = render(<DiagnosticsPanel />)
    expect(screen.queryByTestId('diagnostics-list')).toBe(null)
    useStudio.getState().setStripWidth('A', 0, 1)
    rerender(<DiagnosticsPanel />)
    expect(screen.getByTestId('diagnostics-list').textContent).toContain('не удержится в струбцине')
  })
})

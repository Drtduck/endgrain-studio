import { describe, it, expect, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { baseDesign, isStrip } from '@/lib/engine'
import { useStudio } from '@/lib/store/studio'
import { PanelInspector } from './PanelInspector'

const design = () => useStudio.getState().history.present
const panelA = () => design().panels.find((p) => p.id === 'A')

describe('PanelInspector', () => {
  beforeEach(() => {
    useStudio.getState().resetStudio(baseDesign())
    useStudio.getState().setLocale('ru')
    useStudio.getState().setUnit('mm')
  })

  it('перечисляет панели и их полосы', () => {
    render(<PanelInspector />)
    expect(screen.getByTestId('panel-A')).toBeDefined()
    expect(screen.getByTestId('panel-B')).toBeDefined()
    expect(within(screen.getByTestId('panel-A')).getAllByTestId(/^strip-A-\d+$/)).toHaveLength(2)
  })

  it('показывает ширину панели в текущих единицах', () => {
    render(<PanelInspector />)
    expect(screen.getByTestId('panel-A-meta').textContent).toContain('50')
    // React 19 flushes useSyncExternalStore updates from outside event handlers via a
    // microtask, so the store mutation needs act() here to be visible synchronously below.
    act(() => useStudio.getState().setUnit('in'))
    expect(screen.getByTestId('panel-A-meta').textContent).toContain('1.97')
  })

  it('меняет ширину полосы через поле ввода', () => {
    render(<PanelInspector />)
    const input = screen.getByTestId('strip-A-0-width') as HTMLInputElement
    fireEvent.change(input, { target: { value: '40' } })
    fireEvent.blur(input)
    const el = panelA()?.elements[0]
    expect(el && isStrip(el) ? el.widthMm : 0).toBe(40)
  })

  it('меняет породу полосы через выпадающий список', () => {
    render(<PanelInspector />)
    fireEvent.change(screen.getByTestId('strip-A-0-species'), { target: { value: 'padauk' } })
    expect(panelA()?.elements[0]).toMatchObject({ speciesId: 'padauk' })
  })

  it('добавляет и удаляет полосу в конкретной панели (экспертный режим)', () => {
    render(<PanelInspector />)
    useStudio.getState().setActiveSpecies('padauk')
    fireEvent.click(screen.getByTestId('panel-A-add'))
    expect(panelA()?.elements).toHaveLength(3)
    fireEvent.click(screen.getByTestId('strip-A-0-remove'))
    expect(panelA()?.elements).toHaveLength(2)
  })

  it('главная кнопка «Добавить полосу» добавляет колонку во все используемые панели', () => {
    render(<PanelInspector />)
    const panelB = () => useStudio.getState().history.present.panels.find((p) => p.id === 'B')
    fireEvent.click(screen.getByTestId('panels-add-column'))
    expect(panelA()?.elements).toHaveLength(3)
    expect(panelB()?.elements).toHaveLength(3)
  })

  it('разрезает полосу по введённому размеру', () => {
    render(<PanelInspector />)
    fireEvent.change(screen.getByTestId('strip-A-0-splitat'), { target: { value: '10' } })
    fireEvent.blur(screen.getByTestId('strip-A-0-splitat'))
    fireEvent.click(screen.getByTestId('strip-A-0-split'))
    expect(panelA()?.elements).toHaveLength(3)
    const first = panelA()?.elements[0]
    expect(first && isStrip(first) ? first.widthMm : 0).toBe(10)
  })

  it('переставляет полосы кнопками', () => {
    render(<PanelInspector />)
    const before = panelA()?.elements.map((e) => (isStrip(e) ? e.speciesId : '?'))
    fireEvent.click(screen.getByTestId('strip-A-0-down'))
    const after = panelA()?.elements.map((e) => (isStrip(e) ? e.speciesId : '?'))
    expect(after).toEqual([...(before ?? [])].reverse())
  })

  it('сообщает о пустой панели вместо пустого места', () => {
    useStudio.getState().resetStudio(baseDesign({ panels: [{ id: 'A', elements: [] }], rows: [] }))
    render(<PanelInspector />)
    expect(screen.getByText('В панели нет полос')).toBeDefined()
  })

  it('подсвечивает одинаковый индекс полосы во всех используемых панелях при выборе колонки', () => {
    render(<PanelInspector />)
    act(() => useStudio.getState().selectStrip(0))
    const stripInA = screen.getByTestId('strip-A-0')
    const stripInB = screen.getByTestId('strip-B-0')
    expect(stripInA.className).toContain('border-accent-border')
    expect(stripInB.className).toContain('border-accent-border')
    // Соседний индекс не подсвечен.
    expect(screen.getByTestId('strip-A-1').className).not.toContain('border-accent-border')
  })

  it('вложенный срез не показывает поля обычной полосы, но подписан текстом', () => {
    useStudio.getState().resetStudio(
      baseDesign({
        panels: [
          { id: 'A', elements: [{ kind: 'strip', speciesId: 'maple', widthMm: 25 }] },
          { id: 'B', elements: [{ kind: 'sliceRef', panelId: 'A', thicknessMm: 12, angleDeg: 0, offsetMm: 0 }] },
        ],
        rows: [{ id: 'r1', panelId: 'B', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 }],
      }),
    )
    render(<PanelInspector />)
    expect(screen.getByTestId('strip-B-0').textContent).toContain('Срез панели A')
    expect(screen.queryByTestId('strip-B-0-width')).toBe(null)
    expect(screen.queryByTestId('strip-B-0-species')).toBe(null)
  })

  it('поле угла среза видно только на SliceRef, а не на обычной полосе', () => {
    useStudio.getState().resetStudio(
      baseDesign({
        panels: [
          { id: 'A', elements: [{ kind: 'strip', speciesId: 'maple', widthMm: 25 }] },
          { id: 'B', elements: [{ kind: 'sliceRef', panelId: 'A', thicknessMm: 12, angleDeg: 30, offsetMm: 0 }] },
        ],
        rows: [{ id: 'r1', panelId: 'B', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 }],
      }),
    )
    render(<PanelInspector />)
    expect(screen.queryByTestId('strip-A-0-angle')).toBe(null)
    const angleInput = screen.getByTestId('strip-B-0-angle') as HTMLInputElement
    expect(angleInput.value).toBe('30')
  })

  it('правка угла среза в инспекторе доезжает до документа', () => {
    useStudio.getState().resetStudio(
      baseDesign({
        panels: [
          { id: 'A', elements: [{ kind: 'strip', speciesId: 'maple', widthMm: 25 }] },
          { id: 'B', elements: [{ kind: 'sliceRef', panelId: 'A', thicknessMm: 12, angleDeg: 0, offsetMm: 0 }] },
        ],
        rows: [{ id: 'r1', panelId: 'B', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 }],
      }),
    )
    render(<PanelInspector />)
    const panelB = () => useStudio.getState().history.present.panels.find((p) => p.id === 'B')
    const angleInput = screen.getByTestId('strip-B-0-angle') as HTMLInputElement
    fireEvent.change(angleInput, { target: { value: '25' } })
    fireEvent.blur(angleInput)
    expect(panelB()?.elements[0]).toMatchObject({ angleDeg: 25 })

    fireEvent.click(screen.getByTestId('strip-B-0-flip'))
    expect(panelB()?.elements[0]).toMatchObject({ flip: true })

    const offsetInput = screen.getByTestId('strip-B-0-offset') as HTMLInputElement
    fireEvent.change(offsetInput, { target: { value: '15' } })
    fireEvent.blur(offsetInput)
    expect(panelB()?.elements[0]).toMatchObject({ offsetMm: 15 })
  })

  it('угол среза зажимается в MAX_SLICE_ANGLE_DEG', () => {
    useStudio.getState().resetStudio(
      baseDesign({
        panels: [
          { id: 'A', elements: [{ kind: 'strip', speciesId: 'maple', widthMm: 25 }] },
          { id: 'B', elements: [{ kind: 'sliceRef', panelId: 'A', thicknessMm: 12, angleDeg: 0, offsetMm: 0 }] },
        ],
        rows: [{ id: 'r1', panelId: 'B', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 }],
      }),
    )
    render(<PanelInspector />)
    const panelB = () => useStudio.getState().history.present.panels.find((p) => p.id === 'B')
    const angleInput = screen.getByTestId('strip-B-0-angle') as HTMLInputElement
    fireEvent.change(angleInput, { target: { value: '90' } })
    fireEvent.blur(angleInput)
    expect(panelB()?.elements[0]).toMatchObject({ angleDeg: 60 })
  })
})

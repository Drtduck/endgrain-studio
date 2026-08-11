import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { NumberFieldMm } from './NumberFieldMm'

const base = {
  id: 'kerf',
  labelKey: 'board.kerf' as const,
  unit: 'mm' as const,
  locale: 'ru' as const,
}

describe('NumberFieldMm', () => {
  it('показывает миллиметры и отдаёт миллиметры наружу', () => {
    const onCommitMm = vi.fn()
    render(<NumberFieldMm {...base} valueMm={30} onCommitMm={onCommitMm} />)
    const input = screen.getByLabelText('Толщина пропила') as HTMLInputElement
    expect(input.value).toBe('30')
    fireEvent.change(input, { target: { value: '42' } })
    fireEvent.blur(input)
    expect(onCommitMm).toHaveBeenCalledWith(42)
  })

  it('в дюймах показывает дюймы, а наружу отдаёт миллиметры', () => {
    const onCommitMm = vi.fn()
    render(<NumberFieldMm {...base} unit="in" valueMm={25.4} onCommitMm={onCommitMm} />)
    const input = screen.getByLabelText('Толщина пропила') as HTMLInputElement
    expect(input.value).toBe('1')
    fireEvent.change(input, { target: { value: '2' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCommitMm.mock.calls[0]?.[0]).toBeCloseTo(50.8, 9)
  })

  it('не вызывает onCommitMm на мусорном вводе и возвращает прежнее значение', () => {
    const onCommitMm = vi.fn()
    render(<NumberFieldMm {...base} valueMm={30} onCommitMm={onCommitMm} />)
    const input = screen.getByLabelText('Толщина пропила') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'ерунда' } })
    fireEvent.blur(input)
    expect(onCommitMm).not.toHaveBeenCalled()
    expect(input.value).toBe('30')
  })

  it('Escape откатывает черновик', () => {
    const onCommitMm = vi.fn()
    render(<NumberFieldMm {...base} valueMm={30} onCommitMm={onCommitMm} />)
    const input = screen.getByLabelText('Толщина пропила') as HTMLInputElement
    fireEvent.change(input, { target: { value: '99' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input.value).toBe('30')
    expect(onCommitMm).not.toHaveBeenCalled()
  })

  it('пересобирает черновик при смене единиц снаружи', () => {
    const { rerender } = render(<NumberFieldMm {...base} valueMm={25.4} onCommitMm={() => {}} />)
    const input = screen.getByLabelText('Толщина пропила') as HTMLInputElement
    expect(input.value).toBe('25.4')
    rerender(<NumberFieldMm {...base} unit="in" valueMm={25.4} onCommitMm={() => {}} />)
    expect(input.value).toBe('1')
  })

  it('переводит подпись', () => {
    render(<NumberFieldMm {...base} locale="en" valueMm={30} onCommitMm={() => {}} />)
    expect(screen.getByLabelText('Kerf')).toBeDefined()
  })
})

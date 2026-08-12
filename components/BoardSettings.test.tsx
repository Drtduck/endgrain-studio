import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { baseDesign } from '@/lib/engine'
import { useStudio } from '@/lib/store/studio'
import { BoardSettings } from './BoardSettings'

const design = () => useStudio.getState().history.present

function commitField(testId: string, value: string): void {
  const input = screen.getByTestId(testId)
  fireEvent.change(input, { target: { value } })
  fireEvent.blur(input)
}

describe('BoardSettings', () => {
  beforeEach(() => useStudio.getState().resetStudio(baseDesign()))

  it('правит все размеры доски в миллиметрах', () => {
    render(<BoardSettings />)
    commitField('board-width', '300')
    commitField('board-length', '400')
    commitField('board-thickness', '45')
    commitField('board-kerf', '4')
    commitField('board-allowance', '5')
    commitField('board-planer', '250')
    expect(design().board).toMatchObject({ targetWidthMm: 300, targetLengthMm: 400, thicknessMm: 45 })
    expect(design().kerfMm).toBe(4)
    expect(design().planingAllowanceMm).toBe(5)
    expect(design().planerWidthMm).toBe(250)
  })

  it('правит название проекта', () => {
    render(<BoardSettings />)
    fireEvent.change(screen.getByTestId('board-name'), { target: { value: 'Подарок' } })
    expect(design().name).toBe('Подарок')
  })

  it('переключение на дюймы переписывает значения всех полей', () => {
    render(<BoardSettings />)
    expect((screen.getByTestId('board-thickness') as HTMLInputElement).value).toBe('40')
    act(() => useStudio.getState().setUnit('in'))
    expect(useStudio.getState().unit).toBe('in')
    // В дюймах поле показывает два знака: 40 мм это 1.5748", в поле 1.57
    expect((screen.getByTestId('board-thickness') as HTMLInputElement).value).toBe('1.57')
  })

  it('ввод в дюймах сохраняется в миллиметрах', () => {
    render(<BoardSettings />)
    act(() => useStudio.getState().setUnit('in'))
    commitField('board-thickness', '2')
    expect(design().board.thicknessMm).toBeCloseTo(50.8, 9)
  })

  it('копирует ссылку на проект в буфер обмена', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<BoardSettings />)
    fireEvent.click(screen.getByTestId('share-copy'))
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(String(writeText.mock.calls[0]?.[0])).toContain('#')
    expect(await screen.findByText('Ссылка скопирована')).toBeDefined()
  })

  it('не трогает адресную строку при копировании ссылки', () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const replaceState = vi.spyOn(window.history, 'replaceState')
    render(<BoardSettings />)
    fireEvent.click(screen.getByTestId('share-copy'))
    expect(replaceState).not.toHaveBeenCalled()
    replaceState.mockRestore()
  })

  it('не показывает успех, если буфер обмена отказал', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('нет доступа'))
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<BoardSettings />)
    fireEvent.click(screen.getByTestId('share-copy'))
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('Ссылка скопирована')).toBeNull()
  })
})

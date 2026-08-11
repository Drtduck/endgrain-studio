import { describe, it, expect, beforeEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { makeCheckerboard } from '@/lib/designs/samples'
import { TEMPLATES } from '@/lib/designs/templates'
import { selectDesign, useStudio } from '@/lib/store/studio'
import { TemplateGallery } from './TemplateGallery'

describe('TemplateGallery', () => {
  beforeEach(() => {
    useStudio.getState().resetStudio(makeCheckerboard({ cols: 2, rows: 4 }))
  })

  it('показывает карточку с превью на каждый шаблон', () => {
    const { container } = render(<TemplateGallery />)
    expect(screen.getByTestId('template-gallery')).toBeDefined()
    for (const tpl of TEMPLATES) expect(screen.getByTestId(`template-${tpl.id}`)).toBeDefined()
    expect(container.querySelectorAll('[data-testid^="template-"] svg').length).toBe(TEMPLATES.length)
  })

  it('на чистом проекте применяет шаблон сразу и уводит в редактор', () => {
    render(<TemplateGallery />)
    fireEvent.click(screen.getByTestId('template-stripes-wide'))
    expect(screen.queryByTestId('template-confirm-dialog')).toBe(null)
    expect(selectDesign(useStudio.getState()).id).toBe('stripes-wide')
    expect(useStudio.getState().view).toBe('editor')
  })

  it('на изменённом проекте сначала спрашивает подтверждение', () => {
    act(() => { useStudio.getState().setBoardThicknessMm(50) })
    render(<TemplateGallery />)
    fireEvent.click(screen.getByTestId('template-pinstripe'))
    expect(screen.getByTestId('template-confirm-dialog')).toBeDefined()
    expect(selectDesign(useStudio.getState()).id).not.toBe('pinstripe')

    fireEvent.click(screen.getByTestId('template-confirm'))
    expect(selectDesign(useStudio.getState()).id).toBe('pinstripe')
    expect(useStudio.getState().view).toBe('editor')
  })

  it('отмена оставляет доску нетронутой', () => {
    act(() => { useStudio.getState().setBoardThicknessMm(50) })
    render(<TemplateGallery />)
    const before = selectDesign(useStudio.getState())
    fireEvent.click(screen.getByTestId('template-mosaic-random'))
    fireEvent.click(screen.getByTestId('template-cancel'))
    expect(screen.queryByTestId('template-confirm-dialog')).toBe(null)
    expect(selectDesign(useStudio.getState())).toBe(before)
  })

  it('названия шаблонов переводятся', () => {
    render(<TemplateGallery />)
    expect(screen.getByText('Классическая шахматка')).toBeDefined()
    act(() => { useStudio.getState().setLocale('en') })
    expect(screen.getByText('Classic checkerboard')).toBeDefined()
  })

  it('регрессия: восстановленный документ (без истории undo/redo) тоже спрашивает подтверждение', () => {
    // loadDesign - тот же путь, которым useStudioPersistence поднимает документ из
    // localStorage или ссылки: история пустая, но правки в документе настоящие.
    act(() => { useStudio.getState().loadDesign(makeCheckerboard({ cols: 3, rows: 3 })) })
    expect(useStudio.getState().history.past.length).toBe(0)
    render(<TemplateGallery />)
    fireEvent.click(screen.getByTestId('template-brick-half'))
    expect(screen.getByTestId('template-confirm-dialog')).toBeDefined()
    expect(selectDesign(useStudio.getState()).id).not.toBe('brick-half')
  })

  it('применённое имя шаблона переведено на выбранный язык интерфейса', () => {
    act(() => { useStudio.getState().setLocale('en') })
    render(<TemplateGallery />)
    fireEvent.click(screen.getByTestId('template-checkerboard-classic'))
    expect(selectDesign(useStudio.getState()).name).toBe('Classic checkerboard')
  })
})

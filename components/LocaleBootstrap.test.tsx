import { describe, it, expect, afterEach } from 'vitest'
import { act } from 'react'
import { render } from '@testing-library/react'
import { LocaleBootstrap } from './LocaleBootstrap'
import { useStudio } from '@/lib/store/studio'

describe('LocaleBootstrap', () => {
  afterEach(() => {
    act(() => {
      useStudio.getState().setLocale('ru')
    })
  })

  it('переключает стор на язык из cookie лендинга', () => {
    render(<LocaleBootstrap locale="en" />)
    expect(useStudio.getState().locale).toBe('en')
  })

  it('после ручной смены языка повторно не дёргает стор', () => {
    const { rerender } = render(<LocaleBootstrap locale="en" />)
    act(() => {
      useStudio.getState().setLocale('ru')
    })
    rerender(<LocaleBootstrap locale="en" />)
    expect(useStudio.getState().locale).toBe('ru')
  })

  it('ничего не рендерит', () => {
    const { container } = render(<LocaleBootstrap locale="ru" />)
    expect(container.innerHTML).toBe('')
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { makeCheckerboard } from '@/lib/designs/samples'
import { useStudio } from '@/lib/store/studio'
import { StudioTabs } from './StudioTabs'

describe('StudioTabs', () => {
  beforeEach(() => {
    useStudio.getState().resetStudio(makeCheckerboard({ cols: 2, rows: 2 }))
  })

  it('помечает активную вкладку для скринридера', () => {
    render(<StudioTabs />)
    expect(screen.getByTestId('tab-home').getAttribute('aria-selected')).toBe('true')
    expect(screen.getByTestId('tab-view3d').getAttribute('aria-selected')).toBe('false')
  })

  it('клик переключает вкладку в сторе', () => {
    render(<StudioTabs />)
    fireEvent.click(screen.getByTestId('tab-view3d'))
    expect(useStudio.getState().view).toBe('view3d')
    expect(screen.getByTestId('tab-view3d').getAttribute('aria-selected')).toBe('true')
  })

  it('показывает восемь вкладок, включая главную, генератор, фото, литературу и промо', () => {
    render(<StudioTabs />)
    const views = ['home', 'editor', 'templates', 'generate', 'photo', 'view3d', 'books', 'promo']
    for (const view of views) {
      expect(screen.getByTestId(`tab-${view}`)).toBeDefined()
    }
    expect(screen.getAllByRole('tab')).toHaveLength(views.length)
  })

  it('вкладка литературы видна и без входа в аккаунт', () => {
    render(<StudioTabs />)
    expect(screen.getByTestId('tab-books')).toBeDefined()
  })

  it('клик по вкладке фото переключает вид в сторе', () => {
    render(<StudioTabs />)
    fireEvent.click(screen.getByTestId('tab-photo'))
    expect(useStudio.getState().view).toBe('photo')
    expect(screen.getByTestId('tab-photo').getAttribute('aria-selected')).toBe('true')
  })

  it('переводится вместе с интерфейсом', () => {
    render(<StudioTabs />)
    expect(screen.getByText('Редактор')).toBeDefined()
    fireEvent.click(screen.getByTestId('tab-view3d'))
    act(() => {
      useStudio.getState().setLocale('en')
    })
    expect(screen.getByTestId('tab-editor').textContent).toBe('Editor')
  })
})

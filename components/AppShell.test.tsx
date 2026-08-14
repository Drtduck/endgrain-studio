import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppShell } from './AppShell'

// Шапка это общий AppHeader: он клиентский, тянет стор студии и сессию Supabase.
// Здесь проверяем каркас, а состав самой шапки живёт в AppHeader.test.tsx.
vi.mock('@/components/AppHeader', () => ({
  AppHeader: () => <div data-testid="app-header" />,
}))

describe('AppShell', () => {
  it('рисует общую шапку, содержимое и подвал с правовыми ссылками', () => {
    render(
      <AppShell locale="ru">
        <p data-testid="app-shell-content">содержимое</p>
      </AppShell>,
    )

    expect(screen.getByTestId('app-header')).toBeDefined()
    expect(screen.getByTestId('app-shell-content')).toBeDefined()
    expect(screen.getByTestId('app-shell-footer')).toBeDefined()

    expect(screen.getByTestId('app-shell-footer-blog')).toBeDefined()
    expect(screen.getByTestId('app-shell-footer-privacy')).toBeDefined()
    expect(screen.getByTestId('app-shell-footer-personal-data')).toBeDefined()
    expect(screen.getByTestId('app-shell-footer-consent')).toBeDefined()
  })

  it('правовые ссылки в подвале ведут на страницы домена приложения', () => {
    render(
      <AppShell locale="en">
        <p>x</p>
      </AppShell>,
    )
    expect(screen.getByTestId('app-shell-footer-privacy').getAttribute('href')).toBe('/legal/privacy')
    expect(screen.getByTestId('app-shell-footer-consent').getAttribute('href')).toBe('/legal/consent')
  })
})

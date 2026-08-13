import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppShell } from './AppShell'

describe('AppShell', () => {
  it('рисует шапку со ссылками навигации, переключателем языка и подвал с правовыми ссылками', () => {
    render(
      <AppShell locale="ru">
        <p data-testid="app-shell-content">содержимое</p>
      </AppShell>,
    )

    expect(screen.getByTestId('app-shell-header')).toBeDefined()
    expect(screen.getByTestId('app-shell-footer')).toBeDefined()
    expect(screen.getByTestId('app-shell-logo')).toBeDefined()
    expect(screen.getByTestId('app-shell-content')).toBeDefined()

    expect(screen.getByTestId('app-shell-nav-studio')).toBeDefined()
    expect(screen.getByTestId('app-shell-nav-gallery')).toBeDefined()
    expect(screen.getByTestId('app-shell-nav-pricing')).toBeDefined()
    expect(screen.getByTestId('app-shell-nav-api')).toBeDefined()

    expect(screen.getByTestId('app-shell-footer-blog')).toBeDefined()
    expect(screen.getByTestId('app-shell-footer-privacy')).toBeDefined()
    expect(screen.getByTestId('app-shell-footer-personal-data')).toBeDefined()
    expect(screen.getByTestId('app-shell-footer-consent')).toBeDefined()

    expect(screen.getByTestId('landing-locale-ru')).toBeDefined()
    expect(screen.getByTestId('landing-locale-en')).toBeDefined()
  })

  it('ссылка студии ведёт на корень домена', () => {
    render(
      <AppShell locale="en">
        <p>x</p>
      </AppShell>,
    )
    expect(screen.getByTestId('app-shell-nav-studio').getAttribute('href')).toBe('/')
    expect(screen.getByTestId('app-shell-logo').getAttribute('href')).toBe('/')
  })
})

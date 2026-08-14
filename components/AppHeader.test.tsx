import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ProProvider } from '@/components/ProProvider'
import { SessionProvider } from '@/components/SessionProvider'
import { aiAccess } from '@/lib/ai/quota'
import { makeCheckerboard } from '@/lib/designs/samples'
import type { ProStatus } from '@/lib/stripe/pro'
import { useStudio } from '@/lib/store/studio'
import { AppHeader } from './AppHeader'

vi.mock('@/app/actions/auth', () => ({ signOutAction: vi.fn() }))

const FREE: ProStatus = { pro: false, reason: 'free', plan: null, currentPeriodEnd: null, cancelAtPeriodEnd: false }

function renderHeader() {
  return render(
    <SessionProvider value={{ user: null, enabled: true }}>
      <ProProvider value={{ status: FREE, billingEnabled: false, ai: aiAccess('mock') }}>
        <AppHeader />
      </ProProvider>
    </SessionProvider>,
  )
}

describe('AppHeader', () => {
  beforeEach(() => {
    window.localStorage.clear()
    useStudio.getState().resetStudio(makeCheckerboard({ cols: 2, rows: 2 }))
    useStudio.getState().setLocale('ru')
    useStudio.getState().setUnit('mm')
  })

  it('рисует бренд, язык и профиль, а студийных органов управления не несёт', () => {
    renderHeader()
    expect(screen.getByTestId('app-header')).toBeDefined()
    expect(screen.getByTestId('locale-ru')).toBeDefined()
    expect(screen.getByTestId('account-login')).toBeDefined()
    expect(screen.queryByTestId('tab-editor')).toBe(null)
    expect(screen.queryByTestId('unit-mm')).toBe(null)
  })

  it('логотип ведёт на главную приложения', () => {
    renderHeader()
    expect(screen.getByTestId('app-header-home').getAttribute('href')).toBe('/')
  })

  it('переключатель языка меняет локаль стора', () => {
    renderHeader()
    fireEvent.click(screen.getByTestId('locale-en'))
    expect(useStudio.getState().locale).toBe('en')
  })

  it('набор разделов один и тот же в любом месте приложения', () => {
    renderHeader()
    for (const id of ['app-shell-nav-studio', 'app-shell-nav-gallery', 'app-shell-nav-pricing', 'app-blog-link']) {
      expect(screen.getByTestId(id)).toBeDefined()
    }
    // Гостю ключи API не нужны: страница всё равно попросит войти.
    expect(screen.queryByTestId('app-shell-nav-api')).toBe(null)
  })
})

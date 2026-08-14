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

function renderHeader(props: Parameters<typeof AppHeader>[0] = {}) {
  return render(
    <SessionProvider value={{ user: null, enabled: true }}>
      <ProProvider value={{ status: FREE, billingEnabled: false, ai: aiAccess('mock') }}>
        <AppHeader {...props} />
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

  it('по умолчанию рисует бренд, язык и профиль без вкладок и единиц', () => {
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

  it('в режиме студии добавляет вкладки и переключатель единиц', () => {
    renderHeader({ tabs: true, units: true })
    expect(screen.getByTestId('tab-editor')).toBeDefined()
    fireEvent.click(screen.getByTestId('unit-in'))
    expect(useStudio.getState().unit).toBe('in')
  })

  it('переключатель языка меняет локаль стора', () => {
    renderHeader()
    fireEvent.click(screen.getByTestId('locale-en'))
    expect(useStudio.getState().locale).toBe('en')
  })

  it('инструменты студии рендерятся только когда переданы', () => {
    renderHeader({ tools: <button data-testid="header-tool" type="button" /> })
    expect(screen.getByTestId('header-tool')).toBeDefined()
  })
})

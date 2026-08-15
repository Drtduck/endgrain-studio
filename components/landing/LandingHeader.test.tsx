// Тесты идут на боевом хосте лендинга, а не на дефолтном localhost из jsdom: иначе
// проверки абсолютных ссылок на app.endgrain.app сравнивали бы текущий origin сам с собой.
// @vitest-environment-options { "url": "https://endgrain.app/blog" }
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ProProvider } from '@/components/ProProvider'
import { SessionProvider, type SessionValue } from '@/components/SessionProvider'
import { LandingHeader } from './LandingHeader'
import { aiAccess } from '@/lib/ai/quota'

vi.mock('@/app/actions/auth', () => ({ signOutAction: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const GUEST: SessionValue = { user: null, enabled: true }
const USER: SessionValue = { user: { id: 'u1', email: 'a@example.com' }, enabled: true }
const PRO_STATUS = { pro: false, reason: 'free' as const, plan: null, currentPeriodEnd: null, cancelAtPeriodEnd: false }

function renderHeader(session: SessionValue) {
  return render(
    <SessionProvider value={session}>
      <ProProvider value={{ status: PRO_STATUS, billingEnabled: false, ai: aiAccess('mock') }}>
        <LandingHeader locale="ru" />
      </ProProvider>
    </SessionProvider>,
  )
}

describe('LandingHeader', () => {
  it('гостю показывает кнопку «Начать» вместо аватара', () => {
    renderHeader(GUEST)
    expect(screen.getByTestId('landing-cta-header')).toBeInTheDocument()
    expect(screen.queryByTestId('account-menu-trigger')).toBeNull()
    expect(screen.queryByTestId('landing-open-app')).toBeNull()
  })

  it('залогиненному вместо «Начать» показывает переход в студию и аватар', () => {
    renderHeader(USER)
    expect(screen.queryByTestId('landing-cta-header')).toBeNull()

    const openApp = screen.getByTestId('landing-open-app')
    expect(openApp).toHaveAttribute('href', 'https://app.endgrain.app')

    const trigger = screen.getByTestId('account-menu-trigger')
    expect(trigger).toBeInTheDocument()
    expect(screen.getByTestId('account-email').textContent).toBe('a@example.com')
  })

  it('меню аккаунта на лендинге ведёт на домен студии, а не на текущий домен', async () => {
    renderHeader(USER)
    fireEvent.click(screen.getByTestId('account-menu-trigger'))

    const profile = await screen.findByTestId('account-menu-profile')
    expect(profile).toHaveAttribute('href', 'https://app.endgrain.app/account')
    const mcp = screen.getByTestId('account-menu-mcp')
    expect(mcp).toHaveAttribute('href', 'https://app.endgrain.app/account/api')
  })

  it('без Supabase (enabled=false) остаётся гостевая кнопка «Начать»', () => {
    renderHeader({ user: null, enabled: false })
    expect(screen.getByTestId('landing-cta-header')).toBeInTheDocument()
    expect(screen.queryByTestId('landing-open-app')).toBeNull()
  })
})

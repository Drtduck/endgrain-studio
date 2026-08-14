import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ProProvider, type ProValue } from '@/components/ProProvider'
import { SessionProvider, type SessionValue } from '@/components/SessionProvider'
import { AccountMenu } from './AccountMenu'
import { aiAccess } from '@/lib/ai/quota'
import type { ProStatus } from '@/lib/stripe/pro'

vi.mock('@/app/actions/auth', () => ({ signOutAction: vi.fn() }))

const FREE: ProStatus = { pro: false, reason: 'free', plan: null, currentPeriodEnd: null, cancelAtPeriodEnd: false }
const PRO: ProStatus = {
  pro: true,
  reason: 'subscription',
  plan: 'monthly',
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
}

const USER: SessionValue = { user: { id: 'u1', email: 'a@example.com' }, enabled: true }

function renderWith(session: SessionValue, pro: Partial<ProValue> = {}) {
  return render(
    <SessionProvider value={session}>
      <ProProvider value={{ status: FREE, billingEnabled: false, ai: aiAccess('mock'), ...pro }}>
        <AccountMenu />
      </ProProvider>
    </SessionProvider>,
  )
}

describe('AccountMenu', () => {
  it('без Supabase и без кассы не рендерит ничего', () => {
    const { container } = renderWith({ user: null, enabled: false })
    expect(container.firstChild).toBe(null)
  })

  it('гостю показывает ссылку на вход', () => {
    const { container } = renderWith({ user: null, enabled: true })
    const link = container.querySelector('[data-testid="account-login"]')
    expect(link?.getAttribute('href')).toBe('/login')
    expect(container.querySelector('[data-testid="account-menu-trigger"]')).toBe(null)
  })

  it('вошедшему показывает аватар с инициалом и почтой в доступном имени', () => {
    renderWith(USER)
    const trigger = screen.getByTestId('account-menu-trigger')
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu')
    expect(trigger.getAttribute('aria-label')).toContain('a@example.com')
    expect(trigger.textContent).toContain('A')
    expect(screen.getByTestId('account-email').textContent).toBe('a@example.com')
  })

  it('загруженный аватар показывается картинкой, а не инициалом', () => {
    renderWith({ ...USER, avatarUrl: 'https://cdn.example.com/u1/avatar.webp' })
    const trigger = screen.getByTestId('account-menu-trigger')
    const img = trigger.querySelector('[data-testid="avatar"]')
    expect(img?.getAttribute('data-avatar-kind')).toBe('image')
    expect(img?.getAttribute('src')).toBe('https://cdn.example.com/u1/avatar.webp')
  })

  it('та же картинка стоит в шапке открытого меню', async () => {
    renderWith({ ...USER, avatarUrl: 'https://cdn.example.com/u1/avatar.webp' })
    fireEvent.click(screen.getByTestId('account-menu-trigger'))

    await screen.findByTestId('account-menu-email')
    const images = screen.getAllByTestId('avatar')
    expect(images.length).toBe(2)
    for (const img of images) {
      expect(img.getAttribute('data-avatar-kind')).toBe('image')
      expect(img.getAttribute('src')).toBe('https://cdn.example.com/u1/avatar.webp')
    }
  })

  it('без avatarUrl остаётся инициал', () => {
    renderWith(USER)
    const img = screen.getByTestId('account-menu-trigger').querySelector('[data-testid="avatar"]')
    expect(img?.getAttribute('data-avatar-kind')).toBe('initial')
  })

  it('меню закрыто по умолчанию, клик открывает почту и выход', async () => {
    renderWith(USER)
    expect(screen.queryByTestId('account-signout')).toBe(null)

    fireEvent.click(screen.getByTestId('account-menu-trigger'))

    const email = await screen.findByTestId('account-menu-email')
    expect(email.textContent).toBe('a@example.com')
    expect(email.getAttribute('title')).toBe('a@example.com')
    const signOut = screen.getByTestId('account-signout')
    expect(signOut.getAttribute('role')).toBe('menuitem')
  })

  it('под аватаром лежат профиль и MCP: из шапки эти разделы убраны', async () => {
    renderWith(USER)
    fireEvent.click(screen.getByTestId('account-menu-trigger'))

    const profile = await screen.findByTestId('account-menu-profile')
    expect(profile.getAttribute('href')).toBe('/account')
    const mcp = screen.getByTestId('account-menu-mcp')
    expect(mcp.getAttribute('href')).toBe('/account/api')
    expect(mcp.textContent).toContain('MCP')
  })

  it('бесплатному аккаунту первым пунктом даёт апгрейд на тарифы', async () => {
    renderWith(USER, { status: FREE, billingEnabled: true })
    fireEvent.click(screen.getByTestId('account-menu-trigger'))

    const upgrade = await screen.findByTestId('account-menu-upgrade')
    expect(upgrade.getAttribute('href')).toBe('/pricing')
    expect(screen.getByTestId('account-menu-plan').textContent).toBe('Бесплатный тариф')
    expect(screen.queryByTestId('account-menu-billing')).toBe(null)
  })

  it('подписчику вместо апгрейда даёт тарифы и показывает остаток квоты', async () => {
    renderWith(USER, { status: PRO, billingEnabled: true, ai: aiAccess('pro', 12, 30) })
    fireEvent.click(screen.getByTestId('account-menu-trigger'))

    const billing = await screen.findByTestId('account-menu-billing')
    expect(billing.getAttribute('href')).toBe('/pricing')
    expect(screen.queryByTestId('account-menu-upgrade')).toBe(null)
    expect(screen.getByTestId('account-menu-plan').textContent).toBe('Тариф Pro')
    expect(screen.getByTestId('account-menu-quota').textContent).toContain('18')
  })
})

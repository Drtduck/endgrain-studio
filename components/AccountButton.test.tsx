import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { SessionProvider } from '@/components/SessionProvider'
import { AccountButton } from './AccountButton'

vi.mock('@/app/actions/auth', () => ({ signOutAction: vi.fn() }))

describe('AccountButton', () => {
  it('ничего не рендерит, когда Supabase не настроен', () => {
    const { container } = render(
      <SessionProvider value={{ user: null, enabled: false }}>
        <AccountButton />
      </SessionProvider>,
    )
    expect(container.firstChild).toBe(null)
  })

  it('гостю показывает ссылку на вход', () => {
    const { container } = render(
      <SessionProvider value={{ user: null, enabled: true }}>
        <AccountButton />
      </SessionProvider>,
    )
    const link = container.querySelector('[data-testid="account-login"]')
    expect(link).not.toBe(null)
    expect(link?.getAttribute('href')).toBe('/login')
  })

  it('вошедшему пользователю показывает почту и кнопку выхода', () => {
    const { container } = render(
      <SessionProvider value={{ user: { id: 'u1', email: 'a@example.com' }, enabled: true }}>
        <AccountButton />
      </SessionProvider>,
    )
    expect(container.querySelector('[data-testid="account-email"]')?.textContent).toBe('a@example.com')
    expect(container.querySelector('[data-testid="account-signout"]')).not.toBe(null)
  })
})

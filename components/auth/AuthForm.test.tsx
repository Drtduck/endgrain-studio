import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import { AuthForm } from './AuthForm'

const signInWithPassword = vi.fn(async () => ({ error: null }))
const signUp = vi.fn(async () => ({ data: { session: {} }, error: null }))
const push = vi.fn()
const refresh = vi.fn()

vi.mock('@/lib/supabase/browser', () => ({
  getSupabaseBrowser: () => ({ auth: { signInWithPassword, signUp } }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))

function fillCredentials(container: HTMLElement, email: string, password: string): void {
  const emailInput = container.querySelector('[data-testid="auth-email"]')
  const passwordInput = container.querySelector('[data-testid="auth-password"]')
  fireEvent.change(emailInput as HTMLInputElement, { target: { value: email } })
  fireEvent.change(passwordInput as HTMLInputElement, { target: { value: password } })
}

describe('AuthForm', () => {
  beforeEach(() => {
    signInWithPassword.mockClear()
    signUp.mockClear()
    push.mockClear()
    refresh.mockClear()
  })

  it('signs in with the entered credentials and navigates home', async () => {
    const { container } = render(<AuthForm mode="login" locale="ru" />)
    fillCredentials(container, 'a@example.com', 'password123')
    const form = container.querySelector('[data-testid="auth-form-login"]') as HTMLFormElement
    fireEvent.submit(form)
    await waitFor(() => expect(push).toHaveBeenCalledWith('/'))
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'a@example.com', password: 'password123' })
  })

  it('shows an alert on bad credentials and does not navigate', async () => {
    signInWithPassword.mockResolvedValueOnce({ error: { message: 'Invalid login credentials' } } as never)
    const { container } = render(<AuthForm mode="login" locale="ru" />)
    fillCredentials(container, 'a@example.com', 'wrongpass')
    const form = container.querySelector('[data-testid="auth-form-login"]') as HTMLFormElement
    fireEvent.submit(form)
    await waitFor(() => expect(container.querySelector('[role="alert"]')).toBeDefined())
    const alert = container.querySelector('[role="alert"]')
    expect(alert?.textContent).toBe('Неверная почта или пароль')
    expect(push).not.toHaveBeenCalled()
  })

  it('rejects a short password on registration without calling the network', async () => {
    const { container } = render(<AuthForm mode="register" locale="ru" />)
    fillCredentials(container, 'a@example.com', 'short')
    const form = container.querySelector('[data-testid="auth-form-register"]') as HTMLFormElement
    fireEvent.submit(form)
    expect(signUp).not.toHaveBeenCalled()
    const alert = container.querySelector('[role="alert"]')
    expect(alert?.textContent).toBe('Пароль не короче 8 символов')
  })

  it('shows the confirmation notice when sign up returns no session', async () => {
    signUp.mockResolvedValueOnce({ data: { session: null }, error: null } as never)
    const { container } = render(<AuthForm mode="register" locale="ru" />)
    fillCredentials(container, 'a@example.com', 'password123')
    const form = container.querySelector('[data-testid="auth-form-register"]') as HTMLFormElement
    fireEvent.submit(form)
    await waitFor(() => expect(container.querySelector('[data-testid="auth-confirm-sent"]')).toBeDefined())
    expect(push).not.toHaveBeenCalled()
  })

  it('renders the English submit label for the en locale', () => {
    const { container } = render(<AuthForm mode="login" locale="en" />)
    const submit = container.querySelector('[data-testid="auth-submit"]')
    expect(submit?.textContent).toBe('Sign in')
  })
})

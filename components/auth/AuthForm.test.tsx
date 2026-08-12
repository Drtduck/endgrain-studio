import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import { AuthForm } from './AuthForm'
import { GoogleAuthProvider } from '@/components/GoogleAuthProvider'

const signInWithPassword = vi.fn(async () => ({ error: null }))
const signUp = vi.fn(async () => ({ data: { session: {} }, error: null }))
const signInWithOAuth = vi.fn(async () => ({ error: null }))
const push = vi.fn()
const refresh = vi.fn()

vi.mock('@/lib/supabase/browser', () => ({
  getSupabaseBrowser: () => ({ auth: { signInWithPassword, signUp, signInWithOAuth } }),
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
    signInWithOAuth.mockClear()
    push.mockClear()
    refresh.mockClear()
    // Адресную строку читает сама форма, поэтому каждый тест стартует с чистой.
    window.history.replaceState({}, '', '/login')
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

  it('renders the Google button by default (provider default is available)', () => {
    const { container } = render(<AuthForm mode="login" locale="ru" />)
    expect(container.querySelector('[data-testid="auth-google"]')).not.toBeNull()
  })

  it('does not render the Google button when it is hidden by geo', () => {
    const { container } = render(
      <GoogleAuthProvider value={false}>
        <AuthForm mode="login" locale="ru" />
      </GoogleAuthProvider>
    )
    expect(container.querySelector('[data-testid="auth-google"]')).toBeNull()
  })

  it('starts Google OAuth sign-in with the callback redirect', async () => {
    const { container } = render(
      <GoogleAuthProvider value={true}>
        <AuthForm mode="login" locale="ru" />
      </GoogleAuthProvider>
    )
    const button = container.querySelector('[data-testid="auth-google"]') as HTMLButtonElement
    fireEvent.click(button)
    await waitFor(() => expect(signInWithOAuth).toHaveBeenCalledTimes(1))
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=%2F` },
    })
  })

  it('возвращает на next после входа по паролю', async () => {
    window.history.replaceState({}, '', '/login?next=%2F%3Ftab%3Dcut')
    const { container } = render(<AuthForm mode="login" locale="ru" />)
    fillCredentials(container, 'a@example.com', 'password123')
    fireEvent.submit(container.querySelector('[data-testid="auth-form-login"]') as HTMLFormElement)
    await waitFor(() => expect(push).toHaveBeenCalledWith('/?tab=cut'))
  })

  it('игнорирует открытый редирект в next и уводит на корень', async () => {
    window.history.replaceState({}, '', '/login?next=' + encodeURIComponent('//evil.com'))
    const { container } = render(<AuthForm mode="login" locale="ru" />)
    fillCredentials(container, 'a@example.com', 'password123')
    fireEvent.submit(container.querySelector('[data-testid="auth-form-login"]') as HTMLFormElement)
    await waitFor(() => expect(push).toHaveBeenCalledWith('/'))
  })

  it('возвращает на next после регистрации и прокидывает его в письмо', async () => {
    window.history.replaceState({}, '', '/register?next=%2F%3Ftab%3Dprojects')
    const { container } = render(<AuthForm mode="register" locale="ru" />)
    fillCredentials(container, 'a@example.com', 'password123')
    fireEvent.submit(container.querySelector('[data-testid="auth-form-register"]') as HTMLFormElement)
    await waitFor(() => expect(push).toHaveBeenCalledWith('/?tab=projects'))
    expect(signUp).toHaveBeenCalledWith({
      email: 'a@example.com',
      password: 'password123',
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/?tab=projects')}`,
      },
    })
  })

  it('прокидывает next в redirectTo для входа через Google', async () => {
    window.history.replaceState({}, '', '/login?next=%2F%3Ftab%3Dcut')
    const { container } = render(
      <GoogleAuthProvider value={true}>
        <AuthForm mode="login" locale="ru" />
      </GoogleAuthProvider>
    )
    fireEvent.click(container.querySelector('[data-testid="auth-google"]') as HTMLButtonElement)
    await waitFor(() => expect(signInWithOAuth).toHaveBeenCalledTimes(1))
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/?tab=cut')}`,
      },
    })
  })

  it('shows an error and stays interactive when Google OAuth fails to start', async () => {
    signInWithOAuth.mockResolvedValueOnce({ error: { message: 'network error' } } as never)
    const { container } = render(<AuthForm mode="login" locale="ru" />)
    const button = container.querySelector('[data-testid="auth-google"]') as HTMLButtonElement
    fireEvent.click(button)
    await waitFor(() => expect(container.querySelector('[role="alert"]')).not.toBeNull())
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'Не получилось войти через Google. Попробуйте ещё раз'
    )
  })
})

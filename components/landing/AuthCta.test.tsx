// Тесты идут на боевом хосте лендинга, а не на дефолтном localhost из jsdom: иначе
// проверки «ведёт на домен приложения» сравнивали бы текущий origin сам с собой.
// @vitest-environment-options { "url": "https://endgrain.app/landing" }
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AuthCta } from './AuthCta'
import { t } from '@/lib/i18n'

const signInWithPassword = vi.fn(async () => ({ error: null }))
const signUp = vi.fn(async () => ({ data: { session: {} }, error: null }))
const signInWithOAuth = vi.fn(async () => ({ error: null }))
const push = vi.fn()

vi.mock('@/lib/supabase/browser', () => ({
  getSupabaseBrowser: () => ({ auth: { signInWithPassword, signUp, signInWithOAuth } }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }))

const assign = vi.fn()
vi.mock('@/lib/routing/navigate', () => ({ hardNavigate: (url: string) => assign(url) }))

function renderCta(locale: 'ru' | 'en' = 'ru') {
  return render(<AuthCta locale={locale} testId="landing-cta-hero" label="Начать" className="cta" />)
}

async function openDialog(locale: 'ru' | 'en' = 'ru'): Promise<HTMLElement> {
  renderCta(locale)
  fireEvent.click(screen.getByTestId('landing-cta-hero'))
  return screen.findByTestId('landing-auth-dialog')
}

describe('AuthCta', () => {
  beforeEach(() => {
    signInWithPassword.mockClear()
    signUp.mockClear()
    push.mockClear()
    assign.mockClear()
    window.history.replaceState({}, '', '/landing')
  })

  it('кнопка остаётся ссылкой на страницу регистрации', () => {
    renderCta()
    const link = screen.getByTestId('landing-cta-hero')
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('href', 'https://app.endgrain.app/register?next=%2F')
  })

  it('простой клик открывает окно вместо перехода', async () => {
    renderCta()
    const link = screen.getByTestId('landing-cta-hero')
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    fireEvent(link, event)
    expect(event.defaultPrevented).toBe(true)
    await screen.findByTestId('landing-auth-dialog')
    expect(screen.getByTestId('auth-form-register')).toBeInTheDocument()
  })

  it('клик с модификатором отдаётся браузеру', () => {
    renderCta()
    const link = screen.getByTestId('landing-cta-hero')
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true })
    fireEvent(link, event)
    expect(event.defaultPrevented).toBe(false)
    expect(screen.queryByTestId('landing-auth-dialog')).toBeNull()
  })

  it('переключатель меняет режим и чистит введённую почту', async () => {
    await openDialog()
    fireEvent.change(screen.getByTestId('auth-email'), { target: { value: 'a@example.com' } })
    fireEvent.click(screen.getByTestId('landing-auth-switch'))

    await screen.findByTestId('auth-form-login')
    expect(screen.queryByTestId('auth-form-register')).toBeNull()
    expect((screen.getByTestId('auth-email') as HTMLInputElement).value).toBe('')
  })

  it('заголовок окна следует за режимом и локалью', async () => {
    const dialog = await openDialog('en')
    expect(dialog.textContent ?? '').toContain(t('en', 'auth.registerTitle'))
    fireEvent.click(screen.getByTestId('landing-auth-switch'))
    await waitFor(() => expect(dialog.textContent ?? '').toContain(t('en', 'auth.loginTitle')))
  })

  it('шапка окна показывает логотип и название продукта, как на отдельной странице', async () => {
    const dialog = await openDialog('ru')
    expect(screen.getByTestId('auth-home')).toBeInTheDocument()
    expect(dialog.textContent ?? '').toContain(t('ru', 'app.title'))
  })

  it('вводный текст про регистрацию убран, форма начинается сразу с полей', async () => {
    const dialog = await openDialog('ru')
    expect(dialog.textContent ?? '').not.toContain('Почта и пароль')
    expect(dialog.textContent ?? '').not.toContain('Аккаунт нужен')
    expect(screen.queryByTestId('landing-auth-why')).toBeNull()
  })

  it('строка переключения режима делит обычный текст и жирную кликабельную ссылку', async () => {
    // Триггер открывает окно сразу в режиме регистрации, поэтому строка снизу
    // предлагает переключиться на вход.
    await openDialog('ru')
    const switchButton = screen.getByTestId('landing-auth-switch')
    // Кликабельно только слово-действие, а не вся строка целиком.
    expect(switchButton.textContent).toBe(t('ru', 'auth.signIn'))
    expect(switchButton.parentElement?.textContent).toBe(
      `${t('ru', 'auth.hasAccountPrompt')} ${t('ru', 'auth.signIn')}`
    )

    fireEvent.click(switchButton)
    await screen.findByTestId('auth-form-login')
    const registerSwitch = screen.getByTestId('landing-auth-switch')
    expect(registerSwitch.textContent).toBe(t('ru', 'auth.registerAction'))
    expect(registerSwitch.parentElement?.textContent).toBe(
      `${t('ru', 'auth.noAccountPrompt')} ${t('ru', 'auth.registerAction')}`
    )
  })

  it('Escape закрывает окно', async () => {
    await openDialog()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByTestId('landing-auth-dialog')).toBeNull())
  })

  it('ссылка на сброс пароля абсолютная и ведёт на домен приложения', async () => {
    await openDialog()
    // С лендинга endgrain.app обе ссылки обязаны уводить на соседний домен студии.
    expect(window.location.origin).toBe('https://endgrain.app')
    expect(screen.getByTestId('landing-auth-forgot')).toHaveAttribute(
      'href',
      'https://app.endgrain.app/forgot-password',
    )
    expect(screen.getByTestId('landing-auth-fallback')).toHaveAttribute('href', 'https://app.endgrain.app/login')
  })

  it('регистрация без сессии показывает ожидание письма прямо в окне', async () => {
    signUp.mockResolvedValueOnce({ data: { session: null }, error: null } as never)
    await openDialog()
    fireEvent.change(screen.getByTestId('auth-email'), { target: { value: 'a@example.com' } })
    fireEvent.change(screen.getByTestId('auth-password'), { target: { value: 'password123' } })
    fireEvent.click(screen.getByTestId('auth-consent'))
    fireEvent.submit(screen.getByTestId('auth-form-register'))

    await screen.findByTestId('auth-confirm-sent')
    expect(screen.getByTestId('landing-auth-confirm-close')).toBeInTheDocument()
    expect(assign).not.toHaveBeenCalled()
  })

  it('успешный вход уводит в приложение через смену адреса, а не роутером', async () => {
    await openDialog()
    fireEvent.click(screen.getByTestId('landing-auth-switch'))
    await screen.findByTestId('auth-form-login')
    fireEvent.change(screen.getByTestId('auth-email'), { target: { value: 'a@example.com' } })
    fireEvent.change(screen.getByTestId('auth-password'), { target: { value: 'password123' } })
    fireEvent.submit(screen.getByTestId('auth-form-login'))

    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://app.endgrain.app/'))
    expect(push).not.toHaveBeenCalled()
  })
})

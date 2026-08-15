import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { CreditsPanel } from './CreditsPanel'

const replace = vi.fn()
let params = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/account/billing',
  useSearchParams: () => params,
}))

const readCreditsAction = vi.fn()
const createPackCheckoutAction = vi.fn()
vi.mock('@/app/actions/credits', () => ({
  readCreditsAction: () => readCreditsAction(),
  createPackCheckoutAction: (packId: unknown) => createPackCheckoutAction(packId),
}))

const EMPTY_VIEW = { credits: 0, freeRemaining: 0, freeLimit: 3, totalRemaining: 0, transactions: [] }

describe('CreditsPanel', () => {
  beforeEach(() => {
    replace.mockReset()
    readCreditsAction.mockReset()
    createPackCheckoutAction.mockReset()
    readCreditsAction.mockResolvedValue(EMPTY_VIEW)
    params = new URLSearchParams()
    const store = new Map<string, string>()
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value)
      },
      removeItem: (key: string) => {
        store.delete(key)
      },
    })
  })

  it('показывает три пакета и счётчик из readCreditsAction', async () => {
    readCreditsAction.mockResolvedValue({ credits: 5, freeRemaining: 2, freeLimit: 3, totalRemaining: 7, transactions: [] })
    render(<CreditsPanel locale="ru" />)

    await waitFor(() => expect(screen.getByTestId('credits-total').textContent).toContain('7'))
    expect(screen.getByTestId('credits-pack-frames10')).toBeTruthy()
    expect(screen.getByTestId('credits-pack-frames30')).toBeTruthy()
    expect(screen.getByTestId('credits-pack-frames100')).toBeTruthy()
    expect(screen.getByTestId('credits-pack-popular').textContent).toBe('Выгоднее')
  })

  it('клик по «Купить» кладёт текущий баланс в sessionStorage до ухода на Checkout', async () => {
    readCreditsAction.mockResolvedValue({ credits: 3, freeRemaining: 0, freeLimit: 3, totalRemaining: 3, transactions: [] })
    // Экшен зависает (never resolves): интересует только состояние ДО перехода
    // на Stripe, реальную навигацию window.location.href в jsdom не проверяем.
    createPackCheckoutAction.mockReturnValue(new Promise(() => {}))

    render(<CreditsPanel locale="ru" />)
    await waitFor(() => expect(screen.getByTestId('credits-total').textContent).toContain('3'))

    fireEvent.click(screen.getByTestId('credits-buy-frames10'))

    await waitFor(() => expect(createPackCheckoutAction).toHaveBeenCalledWith('frames10'))
    expect(window.sessionStorage.getItem('egs_frames_before')).toBe('3')
  })

  it('ошибка покупки показывает alert с текстом', async () => {
    readCreditsAction.mockResolvedValue(EMPTY_VIEW)
    createPackCheckoutAction.mockResolvedValue({ ok: false, error: 'failed' })
    render(<CreditsPanel locale="ru" />)
    await waitFor(() => expect(screen.getByTestId('credits-total')).toBeTruthy())

    fireEvent.click(screen.getByTestId('credits-buy-frames10'))

    const alert = await screen.findByTestId('credits-error')
    expect(alert.getAttribute('role')).toBe('alert')
  })

  it('?pack=success опрашивает баланс и в итоге показывает «начислили»', async () => {
    params = new URLSearchParams('pack=success')
    window.sessionStorage.setItem('egs_frames_before', '2')
    readCreditsAction
      .mockResolvedValueOnce(EMPTY_VIEW) // начальная загрузка при монтировании
      .mockResolvedValueOnce({ credits: 12, freeRemaining: 0, freeLimit: 3, totalRemaining: 12, transactions: [] }) // опрос нашёл прирост

    render(<CreditsPanel locale="ru" />)

    // «Начисляем» - промежуточное состояние, может смениться на «начислили»
    // раньше первой проверки RTL (оба мока резолвятся мгновенно): проверяем
    // только конечный результат опроса, а не гонку микротасков.
    const done = await screen.findByTestId('credits-toast-done')
    expect(done.textContent).toContain('10')
    expect(replace).toHaveBeenCalledWith('/account/billing')
    expect(window.sessionStorage.getItem('egs_frames_before')).toBe(null)
  })

  it('?pack=cancel показывает тост отмены без опроса баланса', async () => {
    params = new URLSearchParams('pack=cancel')
    render(<CreditsPanel locale="ru" />)

    const cancel = await screen.findByTestId('credits-toast-cancel')
    expect(cancel).toBeTruthy()
    expect(readCreditsAction).toHaveBeenCalledTimes(1) // только начальная загрузка, без опроса
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { FEEDBACK_ACCEPT_ATTR } from '@/lib/feedback'
import { FeedbackButton } from './FeedbackButton'

const submitFeedbackAction = vi.fn()
let supabaseConfigured = true

vi.mock('@/app/actions/feedback', () => ({
  submitFeedbackAction: (...args: unknown[]) => submitFeedbackAction(...args),
}))

vi.mock('@/lib/supabase/config', () => ({
  isSupabaseConfigured: () => supabaseConfigured,
}))

// Роутера в jsdom нет, а трекер переходов читает usePathname.
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}))

// Скриншот снимает html-to-image через динамический импорт. В jsdom рисовать
// нечем, поэтому подменяем модуль: интересует только то, что клиент дошёл до
// вызова экшена, а не содержимое кадра.
vi.mock('html-to-image', () => ({
  toJpeg: async () => 'data:image/jpeg;base64,c2hvdA==',
}))

/** Кладёт файл в input[type=file] так, чтобы change его увидел. */
function selectFile(input: HTMLInputElement, file: File): void {
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: {
      length: 1,
      item: (i: number) => (i === 0 ? file : null),
      0: file,
    },
  })
  fireEvent.change(input)
}

describe('FeedbackButton', () => {
  beforeEach(() => {
    submitFeedbackAction.mockReset()
    supabaseConfigured = true
    window.sessionStorage.clear()
  })

  it('клик по кнопке открывает попап с полем текста', async () => {
    render(<FeedbackButton />)
    fireEvent.click(screen.getByTestId('feedback-button'))
    expect(await screen.findByTestId('feedback-text')).toBeDefined()
  })

  it('кнопка отправки заблокирована при пустом тексте', async () => {
    render(<FeedbackButton />)
    fireEvent.click(screen.getByTestId('feedback-button'))
    const submit = await screen.findByTestId('feedback-submit')
    expect(submit.hasAttribute('disabled')).toBe(true)
  })

  it('ввод текста и отправка зовут экшен ровно с этим текстом и с route', async () => {
    submitFeedbackAction.mockResolvedValue({ ok: true })
    render(<FeedbackButton />)
    fireEvent.click(screen.getByTestId('feedback-button'))
    const textarea = await screen.findByTestId('feedback-text')
    fireEvent.change(textarea, { target: { value: 'привет автору' } })
    fireEvent.click(screen.getByTestId('feedback-submit'))

    await waitFor(() => expect(submitFeedbackAction).toHaveBeenCalledTimes(1))
    const arg = submitFeedbackAction.mock.calls[0]?.[0] as { body: string; route: string }
    expect(arg.body).toBe('привет автору')
    expect(typeof arg.route).toBe('string')
  })

  it('успех показывает feedback-sent', async () => {
    submitFeedbackAction.mockResolvedValue({ ok: true })
    render(<FeedbackButton />)
    fireEvent.click(screen.getByTestId('feedback-button'))
    const textarea = await screen.findByTestId('feedback-text')
    fireEvent.change(textarea, { target: { value: 'привет' } })
    fireEvent.click(screen.getByTestId('feedback-submit'))

    expect(await screen.findByTestId('feedback-sent')).toBeDefined()
  })

  it('ошибка failed показывает role alert', async () => {
    submitFeedbackAction.mockResolvedValue({ ok: false, error: 'failed' })
    render(<FeedbackButton />)
    fireEvent.click(screen.getByTestId('feedback-button'))
    const textarea = await screen.findByTestId('feedback-text')
    fireEvent.change(textarea, { target: { value: 'привет' } })
    fireEvent.click(screen.getByTestId('feedback-submit'))

    const alert = await screen.findByTestId('feedback-error')
    expect(alert.getAttribute('role')).toBe('alert')
  })

  it('счётчик показывает длину введённого текста', async () => {
    render(<FeedbackButton />)
    fireEvent.click(screen.getByTestId('feedback-button'))
    const textarea = await screen.findByTestId('feedback-text')
    fireEvent.change(textarea, { target: { value: 'привет' } })

    const counter = await screen.findByTestId('feedback-counter')
    expect(counter.textContent ?? '').toContain('6')
  })

  it('без настроенного Supabase кнопки прикрепления нет', async () => {
    supabaseConfigured = false
    render(<FeedbackButton />)
    fireEvent.click(screen.getByTestId('feedback-button'))
    await screen.findByTestId('feedback-text')
    expect(screen.queryByTestId('feedback-attach')).toBe(null)
  })

  it('с настроенным Supabase кнопка прикрепления есть', async () => {
    render(<FeedbackButton />)
    fireEvent.click(screen.getByTestId('feedback-button'))
    expect(await screen.findByTestId('feedback-attach')).toBeDefined()
  })

  it('выбранный файл показывается карточкой и убирается крестиком', async () => {
    render(<FeedbackButton />)
    fireEvent.click(screen.getByTestId('feedback-button'))
    const input = (await screen.findByTestId('feedback-file-input')) as HTMLInputElement
    selectFile(input, new File(['данные'], 'схема.png', { type: 'image/png' }))

    const card = await screen.findByTestId('feedback-attachment')
    expect(card.textContent ?? '').toContain('схема.png')

    fireEvent.click(screen.getByTestId('feedback-attach-remove'))
    await waitFor(() => expect(screen.queryByTestId('feedback-attachment')).toBe(null))
    expect(screen.getByTestId('feedback-attach')).toBeDefined()
  })

  it('файл тяжелее 2 МБ отбивается на клиенте и не попадает в форму', async () => {
    render(<FeedbackButton />)
    fireEvent.click(screen.getByTestId('feedback-button'))
    const input = (await screen.findByTestId('feedback-file-input')) as HTMLInputElement
    const heavy = new File(['x'], 'huge.png', { type: 'image/png' })
    Object.defineProperty(heavy, 'size', { value: 3 * 1024 * 1024 })
    selectFile(input, heavy)

    const alert = await screen.findByTestId('feedback-attach-error')
    expect(alert.getAttribute('role')).toBe('alert')
    expect(screen.queryByTestId('feedback-attachment')).toBe(null)
  })

  it('отправка везёт вложение, скриншот, viewport и лог действий', async () => {
    submitFeedbackAction.mockResolvedValue({ ok: true })
    render(<FeedbackButton />)
    fireEvent.click(screen.getByTestId('feedback-button'))
    const input = (await screen.findByTestId('feedback-file-input')) as HTMLInputElement
    selectFile(input, new File(['данные'], 'схема.png', { type: 'image/png' }))
    await screen.findByTestId('feedback-attachment')

    fireEvent.change(screen.getByTestId('feedback-text'), { target: { value: 'сломалось' } })
    fireEvent.click(screen.getByTestId('feedback-submit'))

    await waitFor(() => expect(submitFeedbackAction).toHaveBeenCalledTimes(1))
    const arg = submitFeedbackAction.mock.calls[0]?.[0] as {
      attachment?: { name: string; type: string; dataBase64: string }
      screenshot?: { dataBase64: string }
      viewport?: string
      url?: string
      actions?: unknown[]
    }
    expect(arg.attachment?.name).toBe('схема.png')
    expect(arg.attachment?.type).toBe('image/png')
    expect((arg.attachment?.dataBase64 ?? '').length > 0).toBe(true)
    expect(arg.screenshot?.dataBase64).toBe('c2hvdA==')
    expect(typeof arg.viewport).toBe('string')
    expect(typeof arg.url).toBe('string')
    expect(Array.isArray(arg.actions)).toBe(true)
  })

  it('без Supabase вложение и скриншот в экшен не уезжают', async () => {
    supabaseConfigured = false
    submitFeedbackAction.mockResolvedValue({ ok: true })
    render(<FeedbackButton />)
    fireEvent.click(screen.getByTestId('feedback-button'))
    fireEvent.change(await screen.findByTestId('feedback-text'), { target: { value: 'текст' } })
    fireEvent.click(screen.getByTestId('feedback-submit'))

    await waitFor(() => expect(submitFeedbackAction).toHaveBeenCalledTimes(1))
    const arg = submitFeedbackAction.mock.calls[0]?.[0] as Record<string, unknown>
    expect(arg['attachment']).toBe(undefined)
    expect(arg['screenshot']).toBe(undefined)
  })

  it('исключение из экшена не вешает попап, а показывает ошибку', async () => {
    submitFeedbackAction.mockRejectedValue(new Error('Body exceeded 5mb limit'))
    render(<FeedbackButton />)
    fireEvent.click(screen.getByTestId('feedback-button'))
    fireEvent.change(await screen.findByTestId('feedback-text'), { target: { value: 'текст' } })
    fireEvent.click(screen.getByTestId('feedback-submit'))

    const alert = await screen.findByTestId('feedback-error')
    expect(alert.getAttribute('role')).toBe('alert')
    // Текст остался в поле: терять набранное при аварии сети нельзя.
    expect((screen.getByTestId('feedback-text') as HTMLTextAreaElement).value).toBe('текст')
    // И попап не завис в «Отправляем»: кнопка снова доступна.
    await waitFor(() =>
      expect(screen.getByTestId('feedback-submit').hasAttribute('disabled')).toBe(false),
    )
  })

  it('в url не уезжает хэш с документом студии', async () => {
    submitFeedbackAction.mockResolvedValue({ ok: true })
    window.location.hash = '#d=' + 'x'.repeat(500)
    render(<FeedbackButton />)
    fireEvent.click(screen.getByTestId('feedback-button'))
    fireEvent.change(await screen.findByTestId('feedback-text'), { target: { value: 'текст' } })
    fireEvent.click(screen.getByTestId('feedback-submit'))

    await waitFor(() => expect(submitFeedbackAction).toHaveBeenCalledTimes(1))
    const arg = submitFeedbackAction.mock.calls[0]?.[0] as { url: string; route: string }
    expect(arg.url.includes('#')).toBe(false)
    expect(arg.route.includes('#')).toBe(false)
    window.location.hash = ''
  })

  it('input file принимает только типы из белого списка', async () => {
    render(<FeedbackButton />)
    fireEvent.click(screen.getByTestId('feedback-button'))
    const input = (await screen.findByTestId('feedback-file-input')) as HTMLInputElement
    expect(input.getAttribute('accept')).toBe(FEEDBACK_ACCEPT_ATTR)
    expect(input.getAttribute('accept')?.includes('svg')).toBe(false)
  })

  it('ошибка attachmentTooBig от сервера показывается отдельным текстом', async () => {
    submitFeedbackAction.mockResolvedValue({ ok: false, error: 'attachmentTooBig' })
    render(<FeedbackButton />)
    fireEvent.click(screen.getByTestId('feedback-button'))
    fireEvent.change(await screen.findByTestId('feedback-text'), { target: { value: 'текст' } })
    fireEvent.click(screen.getByTestId('feedback-submit'))

    const alert = await screen.findByTestId('feedback-error')
    expect(alert.textContent ?? '').toContain('Вложение')
  })
})

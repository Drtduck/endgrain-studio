import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { FeedbackButton } from './FeedbackButton'

const submitFeedbackAction = vi.fn()

vi.mock('@/app/actions/feedback', () => ({
  submitFeedbackAction: (...args: unknown[]) => submitFeedbackAction(...args),
}))

describe('FeedbackButton', () => {
  beforeEach(() => {
    submitFeedbackAction.mockReset()
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
})

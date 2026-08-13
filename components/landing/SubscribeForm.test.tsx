import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import { SubscribeForm } from './SubscribeForm'

const subscribeAction = vi.fn(async (input: unknown) => {
  void input
  return { ok: true } as const
})
vi.mock('@/app/actions/subscribe', () => ({ subscribeAction: (input: unknown) => subscribeAction(input) }))

describe('SubscribeForm', () => {
  beforeEach(() => {
    subscribeAction.mockClear()
  })

  it('подписка без галочки согласия не вызывает subscribeAction', async () => {
    const { container } = render(<SubscribeForm locale="ru" />)
    const email = container.querySelector('[data-testid="subscribe-email"]')
    fireEvent.change(email as HTMLInputElement, { target: { value: 'a@example.com' } })
    const form = container.querySelector('form') as HTMLFormElement
    fireEvent.submit(form)
    expect(subscribeAction).not.toHaveBeenCalled()
    expect(container.querySelector('[data-testid="subscribe-error"]')).not.toBeNull()
  })

  it('подписка с галочкой вызывает subscribeAction', async () => {
    const { container } = render(<SubscribeForm locale="ru" />)
    const email = container.querySelector('[data-testid="subscribe-email"]')
    fireEvent.change(email as HTMLInputElement, { target: { value: 'a@example.com' } })
    const consent = container.querySelector('[data-testid="subscribe-consent"]')
    fireEvent.click(consent as HTMLInputElement)
    const form = container.querySelector('form') as HTMLFormElement
    fireEvent.submit(form)
    await waitFor(() => expect(subscribeAction).toHaveBeenCalledTimes(1))
  })
})

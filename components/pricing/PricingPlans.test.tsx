import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { PricingPlans, type PricingPlansProps } from './PricingPlans'

const createCheckoutAction = vi.fn()
vi.mock('@/app/actions/billing', () => ({ createCheckoutAction: (plan: unknown) => createCheckoutAction(plan) }))

function setup(patch: Partial<PricingPlansProps> = {}) {
  const props: PricingPlansProps = {
    locale: 'ru',
    mode: 'checkout',
    pro: false,
    reason: 'free',
    billingEnabled: true,
    signedIn: true,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    portalUrl: '',
    ...patch,
  }
  return render(<PricingPlans {...props} />)
}

describe('PricingPlans', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('без кассы показывает честную строку и не даёт кнопок покупки', () => {
    const { container } = setup({ billingEnabled: false })
    expect(container.querySelector('[data-testid="pricing-disabled"]')).not.toBe(null)
    expect(container.querySelector('[data-testid="pricing-buy-monthly"]')).toBe(null)
    expect(container.querySelector('[data-testid="pricing-buy-yearly"]')).toBe(null)
  })

  it('гостю предлагает войти вместо покупки', () => {
    const { container } = setup({ signedIn: false })
    const link = container.querySelector('[data-testid="pricing-need-auth"]')
    expect(link).not.toBe(null)
    expect(link?.getAttribute('href')).toBe('/login?next=/pricing')
    expect(container.querySelector('[data-testid="pricing-buy-monthly"]')).toBe(null)
  })

  it('вошедшему без Pro показывает обе кнопки покупки', () => {
    const { container } = setup()
    expect(container.querySelector('[data-testid="pricing-buy-monthly"]')).not.toBe(null)
    expect(container.querySelector('[data-testid="pricing-buy-yearly"]')).not.toBe(null)
  })

  it('подписчику показывает текущий план и ссылку на портал', () => {
    const { container } = setup({
      pro: true,
      reason: 'subscription',
      currentPeriodEnd: '2026-12-01T00:00:00.000Z',
      portalUrl: 'https://billing.stripe.com/p/login/test',
    })
    expect(container.querySelector('[data-testid="pricing-current"]')).not.toBe(null)
    expect(container.querySelector('[data-testid="pricing-manage"]')?.getAttribute('href')).toBe(
      'https://billing.stripe.com/p/login/test',
    )
    expect(container.querySelector('[data-testid="pricing-buy-monthly"]')).toBe(null)
  })

  it('отменённая подписка говорит, что не продлится, а не «оплачено до»', () => {
    const { container } = setup({
      pro: true,
      reason: 'subscription',
      currentPeriodEnd: '2026-12-01T00:00:00.000Z',
      cancelAtPeriodEnd: true,
    })
    const period = container.querySelector('[data-testid="pricing-period"]')?.textContent ?? ''
    expect(period).toContain('не продлится')
    expect(period).not.toContain('Оплачено до')
  })

  it('ошибка от экшена показывается текстом по коду', async () => {
    createCheckoutAction.mockResolvedValue({ ok: false, error: 'failed' })
    const { container } = setup()
    screen.getByTestId('pricing-buy-monthly').click()
    await waitFor(() => expect(container.querySelector('[data-testid="pricing-error"]')).not.toBe(null))
    expect(container.querySelector('[data-testid="pricing-error"]')?.textContent).toContain('Не получилось открыть оплату')
    expect(createCheckoutAction).toHaveBeenCalledWith('monthly')
  })

  it('в режиме ссылки рисует обе карточки и не зовёт экшен', () => {
    const { container } = setup({ mode: 'link' })
    expect(container.querySelector('[data-testid="pricing-free"]')).not.toBe(null)
    expect(container.querySelector('[data-testid="pricing-pro"]')).not.toBe(null)
    expect(container.querySelector('[data-testid="pricing-buy-monthly"]')).toBe(null)
    expect(createCheckoutAction).not.toHaveBeenCalled()
  })
})

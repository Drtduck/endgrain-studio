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
    apiEnabled: false,
    passEnabled: true,
    apiSubscribed: false,
    passExpiresAt: null,
    ...patch,
  }
  return render(<PricingPlans {...props} />)
}

describe('PricingPlans', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('без кассы показывает честную строку и не даёт кнопки покупки Pro', () => {
    const { container } = setup({ billingEnabled: false })
    expect(container.querySelector('[data-testid="pricing-disabled"]')).not.toBe(null)
    expect(container.querySelector('[data-testid="pricing-buy-pro"]')).toBe(null)
  })

  it('гостю предлагает войти вместо покупки', () => {
    const { container } = setup({ signedIn: false })
    const link = container.querySelector('[data-testid="pricing-need-auth"]')
    expect(link).not.toBe(null)
    expect(link?.getAttribute('href')).toBe('/login?next=/pricing')
    expect(container.querySelector('[data-testid="pricing-buy-pro"]')).toBe(null)
  })

  it('вошедшему без Pro карточка Pro показывает ровно одну кнопку покупки и подсказку про тумблер', () => {
    const { container } = setup()
    const button = container.querySelector('[data-testid="pricing-buy-pro"]')
    expect(button).not.toBe(null)
    expect(button?.textContent).toContain('$7.50')
    expect(container.querySelector('[data-testid="pricing-pro"]')?.textContent).toContain('Год выбран заранее')
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
    expect(container.querySelector('[data-testid="pricing-buy-pro"]')).toBe(null)
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

  it('живой Пропуск не запирает от Pro: карточка Pro по-прежнему показывает кнопку покупки, а не «текущий план»', () => {
    const { container } = setup({
      pro: true,
      reason: 'pass',
      currentPeriodEnd: '2026-12-01T00:00:00.000Z',
    })
    const button = container.querySelector('[data-testid="pricing-buy-pro"]')
    expect(button).not.toBe(null)
    expect(container.querySelector('[data-testid="pricing-current"]')).toBe(null)
  })

  it('ошибка от экшена показывается текстом по коду', async () => {
    createCheckoutAction.mockResolvedValue({ ok: false, error: 'failed' })
    const { container } = setup()
    screen.getByTestId('pricing-buy-pro').click()
    await waitFor(() => expect(container.querySelector('[data-testid="pricing-error"]')).not.toBe(null))
    expect(container.querySelector('[data-testid="pricing-error"]')?.textContent).toContain('Не получилось открыть оплату')
    expect(createCheckoutAction).toHaveBeenCalledWith('pro')
  })

  it('в режиме ссылки рисует карточки и не зовёт экшен', () => {
    const { container } = setup({ mode: 'link' })
    expect(container.querySelector('[data-testid="pricing-free"]')).not.toBe(null)
    expect(container.querySelector('[data-testid="pricing-pro"]')).not.toBe(null)
    expect(container.querySelector('[data-testid="pricing-buy-pro"]')).toBe(null)
    expect(container.querySelector('[data-testid="pricing-open-app"]')).not.toBe(null)
    expect(createCheckoutAction).not.toHaveBeenCalled()
  })

  describe('карточка Пропуска', () => {
    it('скрыта, когда цена Пропуска не заведена', () => {
      const { container } = setup({ passEnabled: false })
      expect(container.querySelector('[data-testid="pricing-pass"]')).toBe(null)
    })

    it('показывает кнопку покупки за $19, когда цена заведена', () => {
      const { container } = setup({ passEnabled: true })
      const button = container.querySelector('[data-testid="pricing-buy-pass"]')
      expect(button).not.toBe(null)
      expect(button?.textContent).toContain('$19')
    })

    it('покупку блокирует живая Pro-подписка, но не активный пропуск', () => {
      const subscribed = setup({ passEnabled: true, pro: true, reason: 'subscription' })
      expect(subscribed.container.querySelector('[data-testid="pricing-buy-pass"]')).toBe(null)

      const withPass = setup({
        passEnabled: true,
        pro: true,
        reason: 'pass',
        currentPeriodEnd: '2026-12-01T00:00:00.000Z',
        passExpiresAt: '2026-12-01T00:00:00.000Z',
      })
      expect(withPass.container.querySelector('[data-testid="pricing-buy-pass"]')).not.toBe(null)
      expect(withPass.container.querySelector('[data-testid="pricing-pass-until"]')).not.toBe(null)
    })

    it('покупка пропуска зовёт экшен с планом pass', () => {
      createCheckoutAction.mockResolvedValue({ ok: false, error: 'failed' })
      const { container } = setup({ passEnabled: true })
      ;(container.querySelector('[data-testid="pricing-buy-pass"]') as HTMLButtonElement).click()
      expect(createCheckoutAction).toHaveBeenCalledWith('pass')
    })
  })

  describe('карточка Developer', () => {
    it('без цен API остаётся блоком «Скоро» с почтой, кнопки нет', () => {
      const { container } = setup({ apiEnabled: false })
      expect(container.querySelector('[data-testid="pricing-developer-status"]')).not.toBe(null)
      expect(container.querySelector('[data-testid="pricing-buy-api"]')).toBe(null)
      expect(container.querySelector('a[href="mailto:hello@endgrain.app"]')).not.toBe(null)
    })

    it('с заведёнными ценами показывает кнопку покупки', () => {
      const { container } = setup({ apiEnabled: true })
      const button = container.querySelector('[data-testid="pricing-buy-api"]')
      expect(button).not.toBe(null)
      expect(button?.textContent).toContain('$16.67')
      expect(container.querySelector('[data-testid="pricing-developer-status"]')).toBe(null)
    })

    it('уже оформленную API-подписку показывает как текущий план без кнопки', () => {
      const { container } = setup({ apiEnabled: true, apiSubscribed: true })
      expect(container.querySelector('[data-testid="pricing-api-current"]')).not.toBe(null)
      expect(container.querySelector('[data-testid="pricing-buy-api"]')).toBe(null)
    })

    it('покупка API зовёт экшен с планом api', () => {
      createCheckoutAction.mockResolvedValue({ ok: false, error: 'failed' })
      const { container } = setup({ apiEnabled: true })
      ;(container.querySelector('[data-testid="pricing-buy-api"]') as HTMLButtonElement).click()
      expect(createCheckoutAction).toHaveBeenCalledWith('api')
    })
  })
})

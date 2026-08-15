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
    apiSubscribed: false,
    apiPeriodEnd: null,
    apiCancelAtPeriodEnd: false,
    legacyPassUntil: null,
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

  it('вошедшему без Pro карточка Pro показывает ровно одну кнопку покупки и цену «от $7.50»', () => {
    const { container } = setup()
    const button = container.querySelector('[data-testid="pricing-buy-pro"]')
    expect(button).not.toBe(null)
    expect(container.querySelector('[data-testid="pricing-pro"]')?.textContent).toContain('от $7.50')
    expect(container.querySelector('[data-testid="pricing-pro"]')?.textContent).not.toContain('в подарок')
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

  it('живой унаследованный Пропуск не запирает от Pro: карточка показывает строку про пропуск и активную кнопку покупки', () => {
    const { container } = setup({
      pro: true,
      reason: 'pass',
      currentPeriodEnd: '2026-12-01T00:00:00.000Z',
      legacyPassUntil: '2026-12-01T00:00:00.000Z',
    })
    const legacy = container.querySelector('[data-testid="pricing-legacy-pass"]')
    expect(legacy).not.toBe(null)
    expect(legacy?.textContent).toContain('Продлить его нельзя')
    const button = container.querySelector('[data-testid="pricing-buy-pro"]')
    expect(button).not.toBe(null)
    expect(container.querySelector('[data-testid="pricing-current"]')).toBe(null)
  })

  it('служебный доступ (allowlist/flag) показывает «Доступ открыт» и не предлагает купить Pro', () => {
    const { container } = setup({ pro: true, reason: 'allowlist' })
    expect(container.querySelector('[data-testid="pricing-pro-badge"]')?.textContent).toContain('Доступ открыт')
    expect(container.querySelector('[data-testid="pricing-granted-note"]')).not.toBe(null)
    expect(container.querySelector('[data-testid="pricing-buy-pro"]')).toBe(null)
  })

  it('бесплатному пользователю Free-карточка помечена как текущий план', () => {
    const { container } = setup({ reason: 'free' })
    expect(container.querySelector('[data-testid="pricing-free-badge"]')).not.toBe(null)
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

  describe('карточка Developer', () => {
    it('без цен API остаётся блоком «Скоро» с почтой, кнопки нет', () => {
      const { container } = setup({ apiEnabled: false })
      expect(container.querySelector('[data-testid="pricing-developer-status"]')).not.toBe(null)
      expect(container.querySelector('[data-testid="pricing-buy-api"]')).toBe(null)
      expect(container.querySelector('a[href="mailto:hello@endgrain.app"]')).not.toBe(null)
    })

    it('с заведёнными ценами показывает кнопку покупки и цену «от $16.67»', () => {
      const { container } = setup({ apiEnabled: true })
      const button = container.querySelector('[data-testid="pricing-buy-api"]')
      expect(button).not.toBe(null)
      expect(container.querySelector('[data-testid="pricing-developer"]')?.textContent).toContain('от $16.67')
      expect(container.querySelector('[data-testid="pricing-developer-status"]')).toBe(null)
    })

    it('уже оформленную API-подписку показывает как текущий план с датой и ссылкой на портал', () => {
      const { container } = setup({
        apiEnabled: true,
        apiSubscribed: true,
        apiPeriodEnd: '2026-12-01T00:00:00.000Z',
        portalUrl: 'https://billing.stripe.com/p/login/test',
      })
      expect(container.querySelector('[data-testid="pricing-developer-badge"]')).not.toBe(null)
      expect(container.querySelector('[data-testid="pricing-api-period"]')).not.toBe(null)
      expect(container.querySelector('[data-testid="pricing-api-manage"]')?.getAttribute('href')).toBe(
        'https://billing.stripe.com/p/login/test',
      )
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

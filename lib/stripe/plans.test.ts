import { describe, it, expect, vi, afterEach } from 'vitest'

async function load(env: Record<string, string>) {
  vi.unstubAllEnvs()
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
  vi.resetModules()
  return import('./plans')
}

const FULL_ENV = {
  NEXT_PUBLIC_STRIPE_PRICE_MONTHLY: 'price_m',
  NEXT_PUBLIC_STRIPE_PRICE_YEARLY: 'price_y',
  NEXT_PUBLIC_STRIPE_PRICE_API_MONTHLY: 'price_api_m',
  NEXT_PUBLIC_STRIPE_PRICE_API_YEARLY: 'price_api_y',
}

describe('plans', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('priceIdFor и planForPriceId взаимно обратны', async () => {
    const { priceIdFor, planForPriceId } = await load(FULL_ENV)
    expect(priceIdFor('monthly')).toBe('price_m')
    expect(priceIdFor('yearly')).toBe('price_y')
    expect(planForPriceId('price_m')).toBe('monthly')
    expect(planForPriceId('price_y')).toBe('yearly')
  })

  it('неизвестный price id даёт null', async () => {
    const { planForPriceId } = await load(FULL_ENV)
    expect(planForPriceId('price_unknown')).toBe(null)
  })

  it('при пустых переменных пустой price id даёт null, а не monthly', async () => {
    const { planForPriceId } = await load({})
    expect(planForPriceId('')).toBe(null)
    expect(planForPriceId('price_m')).toBe(null)
  })

  describe('resolvePriceId', () => {
    it('различает продукт pro и api по цене', async () => {
      const { resolvePriceId } = await load(FULL_ENV)
      expect(resolvePriceId('price_m')).toEqual({ product: 'pro', plan: 'monthly' })
      expect(resolvePriceId('price_y')).toEqual({ product: 'pro', plan: 'yearly' })
      expect(resolvePriceId('price_api_m')).toEqual({ product: 'api', plan: 'monthly' })
      expect(resolvePriceId('price_api_y')).toEqual({ product: 'api', plan: 'yearly' })
    })

    it('неизвестный price id даёт null', async () => {
      const { resolvePriceId } = await load(FULL_ENV)
      expect(resolvePriceId('price_unknown')).toBe(null)
    })

    it('пустая строка даёт null даже без ключей', async () => {
      const { resolvePriceId } = await load({})
      expect(resolvePriceId('')).toBe(null)
    })
  })

  describe('checkoutPriceFor', () => {
    // Сессия обязана стартовать с месячной цены и для Pro, и для Developer:
    // тумблер месяц/год рисует Subscription upsell в Dashboard, настроенный
    // веткой «месячная -> годовая», и работает только тогда. С годовой в
    // line_items переключателя на Checkout нет вовсе.
    it('api всегда берёт месячную цену: иначе на Checkout нет тумблера месяц/год', async () => {
      const { checkoutPriceFor } = await load(FULL_ENV)
      expect(checkoutPriceFor('api')).toBe('price_api_m')
    })

    it('pro тоже всегда берёт месячную цену: без переменной-переключателя', async () => {
      const { checkoutPriceFor } = await load(FULL_ENV)
      expect(checkoutPriceFor('pro')).toBe('price_m')
    })
  })
})

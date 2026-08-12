import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Значения читаются на верхнем уровне модуля, поэтому каждая проверка
// подменяет окружение и заново импортирует модуль через resetModules.
async function load(env: Readonly<Record<string, string>>) {
  vi.unstubAllEnvs()
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
  vi.resetModules()
  return import('./config')
}

const FULL = {
  STRIPE_SECRET_KEY: 'sk_test_1',
  STRIPE_WEBHOOK_SECRET: 'whsec_1',
  NEXT_PUBLIC_STRIPE_PRICE_MONTHLY: 'price_m',
  NEXT_PUBLIC_STRIPE_PRICE_YEARLY: 'price_y',
} as const

describe('isStripeConfigured', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('пустое окружение даёт false', async () => {
    const { isStripeConfigured } = await load({
      STRIPE_SECRET_KEY: '',
      STRIPE_WEBHOOK_SECRET: '',
      NEXT_PUBLIC_STRIPE_PRICE_MONTHLY: '',
      NEXT_PUBLIC_STRIPE_PRICE_YEARLY: '',
    })
    expect(isStripeConfigured()).toBe(false)
  })

  it('только секретный ключ даёт false', async () => {
    const { isStripeConfigured } = await load({ ...FULL, STRIPE_WEBHOOK_SECRET: '', NEXT_PUBLIC_STRIPE_PRICE_MONTHLY: '', NEXT_PUBLIC_STRIPE_PRICE_YEARLY: '' })
    expect(isStripeConfigured()).toBe(false)
  })

  it('только секрет вебхука даёт false', async () => {
    const { isStripeConfigured } = await load({ ...FULL, STRIPE_SECRET_KEY: '', NEXT_PUBLIC_STRIPE_PRICE_MONTHLY: '', NEXT_PUBLIC_STRIPE_PRICE_YEARLY: '' })
    expect(isStripeConfigured()).toBe(false)
  })

  it('только цены дают false', async () => {
    const { isStripeConfigured } = await load({ ...FULL, STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '' })
    expect(isStripeConfigured()).toBe(false)
  })

  it('все четыре значения дают true', async () => {
    const { isStripeConfigured } = await load(FULL)
    expect(isStripeConfigured()).toBe(true)
  })
})

describe('hasPublicPrices', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('не зависит от серверных ключей', async () => {
    const { hasPublicPrices, isStripeConfigured } = await load({ ...FULL, STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '' })
    expect(hasPublicPrices()).toBe(true)
    expect(isStripeConfigured()).toBe(false)
  })

  it('без публичных цен даёт false', async () => {
    const { hasPublicPrices } = await load({ ...FULL, NEXT_PUBLIC_STRIPE_PRICE_MONTHLY: '', NEXT_PUBLIC_STRIPE_PRICE_YEARLY: '' })
    expect(hasPublicPrices()).toBe(false)
  })
})

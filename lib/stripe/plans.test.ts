import { describe, it, expect, vi, afterEach } from 'vitest'

async function load(monthly: string, yearly: string) {
  vi.unstubAllEnvs()
  vi.stubEnv('NEXT_PUBLIC_STRIPE_PRICE_MONTHLY', monthly)
  vi.stubEnv('NEXT_PUBLIC_STRIPE_PRICE_YEARLY', yearly)
  vi.resetModules()
  return import('./plans')
}

describe('plans', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('priceIdFor и planForPriceId взаимно обратны', async () => {
    const { priceIdFor, planForPriceId } = await load('price_m', 'price_y')
    expect(priceIdFor('monthly')).toBe('price_m')
    expect(priceIdFor('yearly')).toBe('price_y')
    expect(planForPriceId('price_m')).toBe('monthly')
    expect(planForPriceId('price_y')).toBe('yearly')
  })

  it('неизвестный price id даёт null', async () => {
    const { planForPriceId } = await load('price_m', 'price_y')
    expect(planForPriceId('price_unknown')).toBe(null)
  })

  it('при пустых переменных пустой price id даёт null, а не monthly', async () => {
    const { planForPriceId } = await load('', '')
    expect(planForPriceId('')).toBe(null)
    expect(planForPriceId('price_m')).toBe(null)
  })
})

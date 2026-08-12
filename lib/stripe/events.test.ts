import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import type { parseSubscriptionEvent as ParseFn } from './events'

// Цены задаём до импорта модуля: planForPriceId читает переменные на верхнем уровне.
let parseSubscriptionEvent: typeof ParseFn

beforeAll(async () => {
  vi.stubEnv('NEXT_PUBLIC_STRIPE_PRICE_MONTHLY', 'price_monthly')
  vi.stubEnv('NEXT_PUBLIC_STRIPE_PRICE_YEARLY', 'price_yearly')
  vi.resetModules()
  ;({ parseSubscriptionEvent } = await import('./events'))
})

afterAll(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

const CREATED_SEC = 1_760_000_000
const PERIOD_END_SEC = 1_762_000_000

/** Урезанное, но реальное по форме событие свежей API-версии: период на элементе подписки. */
function newShape(overrides: Record<string, unknown> = {}): unknown {
  return {
    type: 'customer.subscription.created',
    created: CREATED_SEC,
    data: {
      object: {
        id: 'sub_1',
        customer: 'cus_1',
        status: 'active',
        cancel_at_period_end: false,
        metadata: { supabase_user_id: 'user-1' },
        items: { data: [{ price: { id: 'price_monthly' }, current_period_end: PERIOD_END_SEC }] },
        ...overrides,
      },
    },
  }
}

describe('parseSubscriptionEvent', () => {
  it('разбирает свежую форму: период в items.data[0]', () => {
    const res = parseSubscriptionEvent(newShape())
    expect(res?.userId).toBe('user-1')
    expect(res?.customerId).toBe('cus_1')
    expect(res?.subscriptionId).toBe('sub_1')
    expect(res?.priceId).toBe('price_monthly')
    expect(res?.plan).toBe('monthly')
    expect(res?.status).toBe('active')
    expect(res?.currentPeriodEnd).toBe(new Date(PERIOD_END_SEC * 1000).toISOString())
    expect(res?.eventAt).toBe(new Date(CREATED_SEC * 1000).toISOString())
  })

  it('разбирает старую форму: период на верхнем уровне подписки', () => {
    const res = parseSubscriptionEvent(
      newShape({
        current_period_end: PERIOD_END_SEC,
        items: { data: [{ price: { id: 'price_yearly' } }] },
      }),
    )
    expect(res?.plan).toBe('yearly')
    expect(res?.currentPeriodEnd).toBe(new Date(PERIOD_END_SEC * 1000).toISOString())
  })

  it('без периода в обеих формах событие всё равно разбирается', () => {
    const res = parseSubscriptionEvent(newShape({ items: { data: [{ price: { id: 'price_monthly' } }] } }))
    expect(res).not.toBe(null)
    expect(res?.currentPeriodEnd).toBe(null)
  })

  it('customer.subscription.deleted даёт статус canceled', () => {
    const raw = newShape({ status: 'canceled' }) as { type: string }
    raw.type = 'customer.subscription.deleted'
    expect(parseSubscriptionEvent(raw)?.status).toBe('canceled')
  })

  it('cancel_at_period_end доезжает', () => {
    expect(parseSubscriptionEvent(newShape({ cancel_at_period_end: true }))?.cancelAtPeriodEnd).toBe(true)
  })

  it('без metadata.supabase_user_id возвращает null', () => {
    expect(parseSubscriptionEvent(newShape({ metadata: {} }))).toBe(null)
    expect(parseSubscriptionEvent(newShape({ metadata: null }))).toBe(null)
  })

  it('чужой тип события возвращает null', () => {
    const raw = newShape() as { type: string }
    raw.type = 'invoice.paid'
    expect(parseSubscriptionEvent(raw)).toBe(null)
  })

  it('посторонние объекты возвращают null', () => {
    expect(parseSubscriptionEvent({})).toBe(null)
    expect(parseSubscriptionEvent('строка')).toBe(null)
    expect(parseSubscriptionEvent(null)).toBe(null)
  })

  it('неизвестный price id даёт план monthly и событие не отбрасывается', () => {
    const res = parseSubscriptionEvent(
      newShape({ items: { data: [{ price: { id: 'price_пересозданная' }, current_period_end: PERIOD_END_SEC }] } }),
    )
    expect(res?.plan).toBe('monthly')
    expect(res?.priceId).toBe('price_пересозданная')
  })

  it('без event.created отметка берётся из текущего времени, а не из эпохи', () => {
    const raw = newShape() as { created?: number }
    delete raw.created
    const before = Date.now()
    const res = parseSubscriptionEvent(raw)
    expect(res).not.toBe(null)
    const at = Date.parse(res?.eventAt ?? '')
    expect(at).toBeGreaterThanOrEqual(before - 1000)
    expect(at).toBeGreaterThan(Date.parse('2020-01-01T00:00:00.000Z'))
  })

  it('customer развёрнутым объектом тоже разбирается', () => {
    expect(parseSubscriptionEvent(newShape({ customer: { id: 'cus_2' } }))?.customerId).toBe('cus_2')
  })
})

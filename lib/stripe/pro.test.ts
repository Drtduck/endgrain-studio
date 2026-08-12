import { describe, it, expect } from 'vitest'
import { GRACE_MS, resolveProStatus, type SubscriptionRecord } from './pro'

const NOW = Date.parse('2026-08-12T12:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000

function row(patch: Partial<SubscriptionRecord> = {}): SubscriptionRecord {
  return {
    status: 'active',
    plan: 'monthly',
    currentPeriodEnd: new Date(NOW + 10 * DAY).toISOString(),
    cancelAtPeriodEnd: false,
    ...patch,
  }
}

describe('resolveProStatus', () => {
  it('без строки не Pro и причина free', () => {
    expect(resolveProStatus(null, NOW)).toEqual({
      pro: false,
      reason: 'free',
      plan: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    })
  })

  it('active с периодом в будущем даёт Pro', () => {
    const res = resolveProStatus(row(), NOW)
    expect(res.pro).toBe(true)
    expect(res.reason).toBe('subscription')
    expect(res.plan).toBe('monthly')
  })

  it('trialing даёт Pro', () => {
    expect(resolveProStatus(row({ status: 'trialing' }), NOW).pro).toBe(true)
  })

  it('past_due в пределах грейса даёт Pro', () => {
    const res = resolveProStatus(row({ status: 'past_due', currentPeriodEnd: new Date(NOW - DAY).toISOString() }), NOW)
    expect(res.pro).toBe(true)
  })

  it('active с периодом, истёкшим день назад, ещё Pro: грейс три дня', () => {
    expect(resolveProStatus(row({ currentPeriodEnd: new Date(NOW - DAY).toISOString() }), NOW).pro).toBe(true)
    expect(GRACE_MS).toBe(3 * DAY)
  })

  it('active с периодом, истёкшим пять дней назад, уже не Pro', () => {
    expect(resolveProStatus(row({ currentPeriodEnd: new Date(NOW - 5 * DAY).toISOString() }), NOW).pro).toBe(false)
  })

  it('canceled не Pro, но план и дата сохранены в ответе', () => {
    const end = new Date(NOW + 10 * DAY).toISOString()
    const res = resolveProStatus(row({ status: 'canceled', plan: 'yearly', currentPeriodEnd: end }), NOW)
    expect(res.pro).toBe(false)
    expect(res.reason).toBe('free')
    expect(res.plan).toBe('yearly')
    expect(res.currentPeriodEnd).toBe(end)
  })

  it('active без периода даёт Pro', () => {
    expect(resolveProStatus(row({ currentPeriodEnd: null }), NOW).pro).toBe(true)
  })

  it('cancelAtPeriodEnd при active даёт Pro и флаг в ответе', () => {
    const res = resolveProStatus(row({ cancelAtPeriodEnd: true }), NOW)
    expect(res.pro).toBe(true)
    expect(res.cancelAtPeriodEnd).toBe(true)
  })

  it('неизвестный план в строке не ломает разбор', () => {
    expect(resolveProStatus(row({ plan: 'lifetime' }), NOW).plan).toBe(null)
  })
})

import { describe, it, expect } from 'vitest'
import { parseOneTimeEvent } from './oneTime'

function topupEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'checkout.session.completed',
    created: 1_760_000_000,
    data: {
      object: {
        id: 'cs_1',
        mode: 'payment',
        payment_status: 'paid',
        amount_total: 500,
        currency: 'usd',
        metadata: { supabase_user_id: 'user-1', kind: 'wallet_topup' },
        ...overrides,
      },
    },
  }
}

describe('parseOneTimeEvent', () => {
  it('разбирает валидное пополнение кошелька', () => {
    const res = parseOneTimeEvent(topupEvent())
    expect(res).not.toBeNull()
    expect(res?.kind).toBe('wallet_topup')
    expect(res?.userId).toBe('user-1')
    expect(res?.sessionId).toBe('cs_1')
    expect(res?.amountCents).toBe(500)
    expect(res?.currency).toBe('usd')
    expect(res?.eventAt).toBe(new Date(1_760_000_000 * 1000).toISOString())
  })

  it('разбирает разовую покупку Пропуска (pro_pass)', () => {
    const res = parseOneTimeEvent(topupEvent({ metadata: { supabase_user_id: 'user-1', kind: 'pro_pass' }, amount_total: 1900 }))
    expect(res).not.toBeNull()
    expect(res?.kind).toBe('pro_pass')
    expect(res?.userId).toBe('user-1')
    expect(res?.amountCents).toBe(1900)
  })

  it('разбирает покупку из галереи с published_id', () => {
    const res = parseOneTimeEvent(
      topupEvent({ metadata: { supabase_user_id: 'user-1', kind: 'gallery_purchase', published_id: 'pub-1' } }),
    )
    expect(res?.kind).toBe('gallery_purchase')
    expect(res?.publishedId).toBe('pub-1')
  })

  it('mode=subscription не пропускает: подписки не должны утечь в кошелёк', () => {
    expect(parseOneTimeEvent(topupEvent({ mode: 'subscription' }))).toBeNull()
  })

  it('payment_status=unpaid отбивается', () => {
    expect(parseOneTimeEvent(topupEvent({ payment_status: 'unpaid' }))).toBeNull()
  })

  it('чужой kind отбивается', () => {
    expect(parseOneTimeEvent(topupEvent({ metadata: { supabase_user_id: 'user-1', kind: 'something_else' } }))).toBeNull()
  })

  it('отсутствие supabase_user_id отбивается', () => {
    expect(parseOneTimeEvent(topupEvent({ metadata: { kind: 'wallet_topup' } }))).toBeNull()
  })

  it('чужая валюта отбивается', () => {
    expect(parseOneTimeEvent(topupEvent({ currency: 'eur' }))).toBeNull()
  })

  it('чужой тип события отбивается', () => {
    expect(parseOneTimeEvent({ ...topupEvent(), type: 'payment_intent.succeeded' })).toBeNull()
  })

  it('нулевая и дробная сумма отбивается', () => {
    expect(parseOneTimeEvent(topupEvent({ amount_total: 0 }))).toBeNull()
    expect(parseOneTimeEvent(topupEvent({ amount_total: 5.5 }))).toBeNull()
  })

  it('битый вход не бросает исключение', () => {
    expect(parseOneTimeEvent(null)).toBeNull()
    expect(parseOneTimeEvent('garbage')).toBeNull()
    expect(parseOneTimeEvent({})).toBeNull()
  })
})

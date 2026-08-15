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

describe('parseOneTimeEvent: merch (§6.1 спеки merch-orders.md)', () => {
  it('kind=merch разбирается, merch_order_id доезжает', () => {
    const res = parseOneTimeEvent(
      topupEvent({
        amount_total: 2199,
        metadata: { supabase_user_id: 'user-1', kind: 'merch', merch_order_id: 'order-1' },
      }),
    )
    expect(res).not.toBeNull()
    expect(res?.kind).toBe('merch')
    expect(res?.merchOrderId).toBe('order-1')
  })

  it('адрес из старого shipping_details попадает в shipping', () => {
    const res = parseOneTimeEvent(
      topupEvent({
        metadata: { supabase_user_id: 'user-1', kind: 'merch', merch_order_id: 'order-1' },
        shipping_details: {
          name: 'John Doe',
          address: { line1: '1 Main St', line2: null, city: 'Springfield', state: 'IL', postal_code: '62701', country: 'US' },
        },
        customer_details: { email: 'john@example.com', phone: '+15551234567', name: null },
      }),
    )
    expect(res?.shipping).toEqual({
      name: 'John Doe',
      line1: '1 Main St',
      line2: null,
      city: 'Springfield',
      state: 'IL',
      postalCode: '62701',
      country: 'US',
      email: 'john@example.com',
      phone: '+15551234567',
    })
  })

  it('адрес из нового collected_information.shipping_details побеждает старый shipping_details', () => {
    const res = parseOneTimeEvent(
      topupEvent({
        metadata: { supabase_user_id: 'user-1', kind: 'merch', merch_order_id: 'order-1' },
        shipping_details: { name: 'Old', address: { line1: 'old', city: 'old', country: 'US', postal_code: '00000', state: 'CA' } },
        collected_information: {
          shipping_details: {
            name: 'New Name',
            address: { line1: 'New St', city: 'New City', country: 'DE', postal_code: '10115', state: null },
          },
        },
        customer_details: { email: 'new@example.com', phone: null, name: null },
      }),
    )
    expect(res?.shipping?.name).toBe('New Name')
    expect(res?.shipping?.line1).toBe('New St')
    expect(res?.shipping?.country).toBe('DE')
  })

  it('без адреса в событии shipping заполнен null-полями, а не бросает', () => {
    const res = parseOneTimeEvent(topupEvent({ metadata: { supabase_user_id: 'user-1', kind: 'merch', merch_order_id: 'order-1' } }))
    expect(res?.shipping).toEqual({
      name: null,
      line1: null,
      line2: null,
      city: null,
      state: null,
      postalCode: null,
      country: null,
      email: null,
      phone: null,
    })
  })

  it('shipping = null для остальных kind (wallet_topup)', () => {
    const res = parseOneTimeEvent(topupEvent())
    expect(res?.shipping).toBeNull()
    expect(res?.merchOrderId).toBeNull()
  })
})

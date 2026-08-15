import { describe, expect, it } from 'vitest'
import type { OneTimeShipping } from '@/lib/stripe/oneTime'
import { recipientFrom } from './recipient'

function shipping(overrides: Partial<OneTimeShipping> = {}): OneTimeShipping {
  return {
    name: 'John Doe',
    line1: '1 Main St',
    line2: null,
    city: 'Springfield',
    state: 'IL',
    postalCode: '62701',
    country: 'US',
    email: 'john@example.com',
    phone: '+15551234567',
    ...overrides,
  }
}

describe('recipientFrom', () => {
  it('собирает получателя из полного адреса США со state_code', () => {
    const recipient = recipientFrom(shipping())
    expect(recipient).toEqual({
      name: 'John Doe',
      address1: '1 Main St',
      address2: null,
      city: 'Springfield',
      stateCode: 'IL',
      countryCode: 'US',
      zip: '62701',
      email: 'john@example.com',
      phone: '+15551234567',
    })
  })

  it('null при shipping = null (в событии не пришёл адрес вовсе)', () => {
    expect(recipientFrom(null)).toBeNull()
  })

  it('null при отсутствии address1', () => {
    expect(recipientFrom(shipping({ line1: null }))).toBeNull()
  })

  it('null при отсутствии state для США (обязателен для US/CA/AU)', () => {
    expect(recipientFrom(shipping({ state: null }))).toBeNull()
  })

  it('null при отсутствии state для Канады', () => {
    expect(recipientFrom(shipping({ country: 'CA', state: null }))).toBeNull()
  })

  it('null при отсутствии state для Австралии', () => {
    expect(recipientFrom(shipping({ country: 'AU', state: null }))).toBeNull()
  })

  it('проходит без state для Германии: страна не требует state_code', () => {
    const recipient = recipientFrom(shipping({ country: 'DE', state: null }))
    expect(recipient).not.toBeNull()
    expect(recipient?.stateCode).toBeNull()
  })

  it('null при отсутствии email', () => {
    expect(recipientFrom(shipping({ email: null }))).toBeNull()
  })

  it('null при отсутствии имени', () => {
    expect(recipientFrom(shipping({ name: null }))).toBeNull()
  })

  it('null при отсутствии города или индекса', () => {
    expect(recipientFrom(shipping({ city: null }))).toBeNull()
    expect(recipientFrom(shipping({ postalCode: null }))).toBeNull()
  })

  it('null при отсутствии страны', () => {
    expect(recipientFrom(shipping({ country: null }))).toBeNull()
  })

  it('пустая строка трактуется как отсутствие поля', () => {
    expect(recipientFrom(shipping({ line1: '   ' }))).toBeNull()
  })

  it('phone и address2 необязательны и остаются null, если их нет', () => {
    const recipient = recipientFrom(shipping({ phone: null, line2: null }))
    expect(recipient?.phone).toBeNull()
    expect(recipient?.address2).toBeNull()
  })
})

import { describe, it, expect } from 'vitest'
import { subscribeSchema, EMAIL_MAX_LENGTH } from './subscribe'

describe('subscribeSchema', () => {
  it('отбивает пустую строку', () => {
    expect(subscribeSchema.safeParse({ email: '' }).success).toBe(false)
  })

  it('отбивает не-почту', () => {
    expect(subscribeSchema.safeParse({ email: 'не-почта' }).success).toBe(false)
  })

  it('приводит к нижнему регистру и триммит', () => {
    const res = subscribeSchema.safeParse({ email: '  Stas@Example.com  ' })
    expect(res.success).toBe(true)
    if (res.success) expect(res.data.email).toBe('stas@example.com')
  })

  it('отбивает адрес длиннее 254 символов', () => {
    const local = 'a'.repeat(EMAIL_MAX_LENGTH)
    const email = `${local}@example.com`
    expect(email.length).toBeGreaterThan(EMAIL_MAX_LENGTH)
    expect(subscribeSchema.safeParse({ email }).success).toBe(false)
  })

  it('принимает валидный адрес ровно на границе длины', () => {
    const local = 'a'.repeat(EMAIL_MAX_LENGTH - '@example.com'.length)
    const email = `${local}@example.com`
    expect(email.length).toBe(EMAIL_MAX_LENGTH)
    expect(subscribeSchema.safeParse({ email }).success).toBe(true)
  })

  it('отбивает заполненную ловушку company', () => {
    const res = subscribeSchema.safeParse({ email: 'stas@example.com', company: 'бот' })
    expect(res.success).toBe(false)
  })

  it('пропускает пустую ловушку company', () => {
    const res = subscribeSchema.safeParse({ email: 'stas@example.com', company: '' })
    expect(res.success).toBe(true)
  })
})

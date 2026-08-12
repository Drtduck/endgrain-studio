import { describe, expect, it } from 'vitest'
import { DAY_MS, HOUR_MS, clientIp, createRateLimiter } from './rateLimit'

describe('createRateLimiter', () => {
  const T0 = 1_700_000_000_000

  it('пропускает ровно limit обращений в час и отбивает следующее', () => {
    const limiter = createRateLimiter()
    for (let i = 0; i < 3; i += 1) expect(limiter.take('ip-1', 3, T0)).toBe('ok')
    expect(limiter.take('ip-1', 3, T0)).toBe('ip')
  })

  it('окно скользит: через час счёт начинается заново', () => {
    const limiter = createRateLimiter()
    expect(limiter.take('ip-1', 1, T0)).toBe('ok')
    expect(limiter.take('ip-1', 1, T0 + HOUR_MS - 1)).toBe('ip')
    expect(limiter.take('ip-1', 1, T0 + HOUR_MS)).toBe('ok')
  })

  it('адреса считаются независимо друг от друга', () => {
    const limiter = createRateLimiter()
    expect(limiter.take('ip-1', 1, T0)).toBe('ok')
    expect(limiter.take('ip-2', 1, T0)).toBe('ok')
    expect(limiter.take('ip-1', 1, T0)).toBe('ip')
  })

  it('общий дневной потолок отбивает даже свежий адрес', () => {
    const limiter = createRateLimiter(2)
    expect(limiter.take('ip-1', 10, T0)).toBe('ok')
    expect(limiter.take('ip-2', 10, T0)).toBe('ok')
    expect(limiter.take('ip-3', 10, T0)).toBe('daily')
    expect(limiter.take('ip-3', 10, T0 + DAY_MS)).toBe('ok')
  })

  it('отбитое по личному лимиту обращение не тратит общий потолок', () => {
    const limiter = createRateLimiter(2)
    expect(limiter.take('ip-1', 1, T0)).toBe('ok')
    expect(limiter.take('ip-1', 1, T0)).toBe('ip')
    expect(limiter.take('ip-2', 1, T0)).toBe('ok')
    expect(limiter.take('ip-3', 1, T0)).toBe('daily')
  })

  it('протухшие ключи не копятся: старый адрес снова получает полный лимит', () => {
    const limiter = createRateLimiter()
    expect(limiter.take('ip-1', 1, T0)).toBe('ok')
    expect(limiter.take('ip-2', 1, T0 + HOUR_MS * 2)).toBe('ok')
    expect(limiter.take('ip-1', 1, T0 + HOUR_MS * 2)).toBe('ok')
  })
})

describe('clientIp', () => {
  it('берёт первый адрес из цепочки x-forwarded-for', () => {
    expect(clientIp('203.0.113.7, 70.41.3.18, 150.172.238.178', null)).toBe('203.0.113.7')
  })

  it('падает на x-real-ip, когда цепочки нет', () => {
    expect(clientIp(null, '198.51.100.4')).toBe('198.51.100.4')
    expect(clientIp('  ', '198.51.100.4')).toBe('198.51.100.4')
  })

  it('без обоих заголовков даёт общий ключ, а не пустую строку', () => {
    expect(clientIp(null, null)).toBe('unknown')
  })
})

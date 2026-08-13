import { describe, expect, it } from 'vitest'
import { API_DAILY_LIMIT, API_KEYS_PER_USER } from './limits'

describe('lib/api/limits', () => {
  it('free строго меньше developer по обоим лимитам, все значения положительные целые', () => {
    expect(API_DAILY_LIMIT.free).toBeLessThan(API_DAILY_LIMIT.developer)
    expect(API_KEYS_PER_USER.free).toBeLessThan(API_KEYS_PER_USER.developer)
    for (const value of [API_DAILY_LIMIT.free, API_DAILY_LIMIT.developer, API_KEYS_PER_USER.free, API_KEYS_PER_USER.developer]) {
      expect(Number.isInteger(value)).toBe(true)
      expect(value).toBeGreaterThan(0)
    }
  })
})

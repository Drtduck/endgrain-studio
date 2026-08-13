import { describe, expect, it } from 'vitest'
import { OPT_IN_COUNTRIES } from '@/lib/consent/regions'
import { defaultPayloads, updatePayload } from './consentMode'

describe('defaultPayloads', () => {
  const [regional, global] = defaultPayloads()

  it('в обоих payload-ах рекламные три параметра denied', () => {
    for (const payload of [regional, global]) {
      expect(payload.ad_storage).toBe('denied')
      expect(payload.ad_user_data).toBe('denied')
      expect(payload.ad_personalization).toBe('denied')
    }
  })

  it('в региональном все четыре denied и region совпадает с OPT_IN_COUNTRIES', () => {
    expect(regional.analytics_storage).toBe('denied')
    expect(regional.region).toEqual(OPT_IN_COUNTRIES)
  })

  it('в глобальном analytics_storage granted', () => {
    expect(global.analytics_storage).toBe('granted')
    expect(global.region).toBeUndefined()
  })
})

describe('updatePayload', () => {
  it('не трогает рекламные параметры ни при true, ни при false', () => {
    for (const analytics of [true, false]) {
      const payload = updatePayload(analytics)
      expect(payload.ad_storage).toBe('denied')
      expect(payload.ad_user_data).toBe('denied')
      expect(payload.ad_personalization).toBe('denied')
    }
  })

  it('меняет только analytics_storage', () => {
    expect(updatePayload(true).analytics_storage).toBe('granted')
    expect(updatePayload(false).analytics_storage).toBe('denied')
  })
})

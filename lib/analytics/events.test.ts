import { afterEach, describe, expect, it } from 'vitest'
import { track } from './events'

afterEach(() => {
  delete window.dataLayer
})

describe('track', () => {
  it('создаёт dataLayer, если его нет', () => {
    expect(window.dataLayer).toBeUndefined()
    track('project_saved')
    expect(Array.isArray(window.dataLayer)).toBe(true)
  })

  it('пушит имя события без параметров', () => {
    track('pricing_viewed')
    expect(window.dataLayer).toEqual([{ event: 'pricing_viewed' }])
  })

  it('пушит имя и параметры', () => {
    track('pdf_exported', { pro: true })
    expect(window.dataLayer).toEqual([{ event: 'pdf_exported', pro: true }])
    track('checkout_started', { plan: 'yearly' })
    expect(window.dataLayer).toEqual([
      { event: 'pdf_exported', pro: true },
      { event: 'checkout_started', plan: 'yearly' },
    ])
  })

  it('копит несколько событий подряд', () => {
    track('project_saved')
    track('subscription_paid')
    expect(window.dataLayer).toEqual([{ event: 'project_saved' }, { event: 'subscription_paid' }])
  })
})

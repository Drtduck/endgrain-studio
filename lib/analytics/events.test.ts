import { afterEach, describe, expect, it } from 'vitest'
import { track } from './events'

afterEach(() => {
  delete window.dataLayer
  delete window.gtag
})

describe('track', () => {
  it('создаёт dataLayer, если его нет', () => {
    expect(window.dataLayer).toBeUndefined()
    track('project_saved')
    expect(Array.isArray(window.dataLayer)).toBe(true)
  })

  it('без window.gtag кладёт arguments-совместимую запись [event, name, params], а не объект {event}', () => {
    track('pricing_viewed')
    expect(window.dataLayer).toEqual([['event', 'pricing_viewed', {}]])
  })

  it('передаёт параметры третьим элементом', () => {
    track('pdf_exported', { pro: true })
    expect(window.dataLayer).toEqual([['event', 'pdf_exported', { pro: true }]])
    track('checkout_started', { plan: 'pro' })
    expect(window.dataLayer).toEqual([
      ['event', 'pdf_exported', { pro: true }],
      ['event', 'checkout_started', { plan: 'pro' }],
    ])
  })

  it('копит несколько событий подряд', () => {
    track('project_saved')
    track('subscription_paid')
    expect(window.dataLayer).toEqual([
      ['event', 'project_saved', {}],
      ['event', 'subscription_paid', {}],
    ])
  })

  it('если window.gtag объявлен (инлайновый скрипт Analytics.tsx уже выполнился) - зовёт его вместо прямого push', () => {
    const calls: unknown[][] = []
    window.gtag = (...args: unknown[]) => {
      calls.push(args)
    }
    track('pdf_exported', { pro: false })
    expect(calls).toEqual([['event', 'pdf_exported', { pro: false }]])
  })
})

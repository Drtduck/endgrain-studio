import { afterEach, describe, expect, it } from 'vitest'
import { callGtag } from './gtag'

afterEach(() => {
  delete window.dataLayer
  delete window.gtag
})

describe('callGtag', () => {
  it('без window.gtag кладёт arguments-совместимый массив прямо в dataLayer', () => {
    callGtag('consent', 'update', { analytics_storage: 'granted' })
    expect(window.dataLayer).toEqual([['consent', 'update', { analytics_storage: 'granted' }]])
  })

  it('с window.gtag зовёт его напрямую, а не пушит в dataLayer сам', () => {
    const calls: unknown[][] = []
    window.gtag = (...args: unknown[]) => calls.push(args)
    callGtag('event', 'project_saved', {})
    expect(calls).toEqual([['event', 'project_saved', {}]])
  })

  it('создаёт dataLayer, если его нет, даже когда window.gtag уже объявлен', () => {
    window.gtag = () => undefined
    expect(window.dataLayer).toBeUndefined()
    callGtag('event', 'project_saved', {})
    expect(Array.isArray(window.dataLayer)).toBe(true)
  })
})

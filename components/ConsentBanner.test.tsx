import { afterEach, describe, expect, it } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { ConsentBanner } from './ConsentBanner'
import { ConsentProvider } from './ConsentProvider'
import type { ConsentDecision } from '@/lib/consent/cookie'
import type { ConsentRegime } from '@/lib/consent/regions'

function clearCookies(): void {
  for (const name of ['eg-consent']) {
    document.cookie = `${name}=; Path=/; Max-Age=0`
  }
}

function clearGpc(): void {
  Object.defineProperty(window.navigator, 'globalPrivacyControl', {
    value: undefined,
    configurable: true,
  })
}

afterEach(() => {
  clearCookies()
  clearGpc()
  delete window.dataLayer
})

function renderBanner(regime: ConsentRegime, initialDecision: ConsentDecision | null = null) {
  return render(
    <ConsentProvider regime={regime} initialDecision={initialDecision}>
      <ConsentBanner />
    </ConsentProvider>
  )
}

describe('ConsentBanner', () => {
  it('режим opt-in рисует обе кнопки и не рисует отмеченный чекбокс', () => {
    const { container } = renderBanner('opt-in')
    expect(container.querySelector('[data-testid="consent-accept"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="consent-decline"]')).not.toBeNull()
    expect(container.querySelectorAll('input[type="checkbox"]:checked').length).toBe(0)
  })

  it('режим opt-out рисует уведомление и кнопку отключения аналитики', () => {
    const { container } = renderBanner('opt-out')
    expect(container.querySelector('[data-testid="consent-disable-analytics"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="consent-got-it"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="consent-accept"]')).toBeNull()
  })

  it('при валидном решении не рисует ничего', () => {
    const decision: ConsentDecision = { analytics: false, regime: 'opt-in', source: 'banner', at: 1 }
    const { container } = renderBanner('opt-in', decision)
    expect(container.querySelector('[data-testid="consent-banner"]')).toBeNull()
    expect(container.querySelector('[data-testid="consent-gpc-ack"]')).toBeNull()
  })

  it('нажатие «Принять» пишет cookie с analytics=1 и пушит consent update в dataLayer', async () => {
    const { container } = renderBanner('opt-in')
    const accept = container.querySelector('[data-testid="consent-accept"]') as HTMLButtonElement
    accept.click()
    await waitFor(() => expect(document.cookie).toContain('eg-consent=1.1.'))
    expect(window.dataLayer).toContainEqual([
      'consent',
      'update',
      { ad_storage: 'denied', analytics_storage: 'granted', ad_user_data: 'denied', ad_personalization: 'denied' },
    ])
  })

  it('нажатие «Отклонить» пишет cookie с analytics=0', async () => {
    const { container } = renderBanner('opt-in')
    const decline = container.querySelector('[data-testid="consent-decline"]') as HTMLButtonElement
    decline.click()
    await waitFor(() => expect(document.cookie).toContain('eg-consent=1.0.'))
  })

  it('при GPC рисуется consent-gpc-ack и пишется решение с source=gpc', async () => {
    Object.defineProperty(window.navigator, 'globalPrivacyControl', { value: true, configurable: true })
    const { container } = renderBanner('opt-in')
    await waitFor(() => expect(container.querySelector('[data-testid="consent-gpc-ack"]')).not.toBeNull())
    expect(document.cookie).toContain('.gpc.')
    expect(container.querySelector('[data-testid="consent-banner"]')).toBeNull()
  })

  it('решение с source=settings и analytics=1 не перезаписывается GPC', () => {
    Object.defineProperty(window.navigator, 'globalPrivacyControl', { value: true, configurable: true })
    const decision: ConsentDecision = { analytics: true, regime: 'opt-in', source: 'settings', at: 1 }
    const { container } = renderBanner('opt-in', decision)
    expect(container.querySelector('[data-testid="consent-gpc-ack"]')).toBeNull()
    expect(container.querySelector('[data-testid="consent-banner"]')).toBeNull()
  })
})

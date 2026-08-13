import { afterEach, describe, expect, it } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { ConsentSettings } from './ConsentSettings'
import { ConsentProvider } from './ConsentProvider'
import type { ConsentDecision } from '@/lib/consent/cookie'

afterEach(() => {
  document.cookie = 'eg-consent=; Path=/; Max-Age=0'
})

describe('ConsentSettings', () => {
  it('показывает текущее состояние и источник', () => {
    const decision: ConsentDecision = { analytics: true, regime: 'opt-in', source: 'banner', at: 1755043200 }
    const { container } = render(
      <ConsentProvider regime="opt-in" initialDecision={decision}>
        <ConsentSettings locale="ru" />
      </ConsentProvider>
    )
    expect(container.querySelector('[data-testid="consent-settings-status"]')?.textContent).toBe(
      'Аналитика включена'
    )
    expect(container.querySelector('[data-testid="consent-settings-source"]')?.textContent).toContain(
      'кнопка баннера'
    )
  })

  it('переключатель пишет source=settings', () => {
    const { container } = render(
      <ConsentProvider regime="opt-in" initialDecision={null}>
        <ConsentSettings locale="ru" />
      </ConsentProvider>
    )
    const toggle = container.querySelector('[data-testid="consent-settings-toggle"]') as HTMLInputElement
    fireEvent.click(toggle)
    expect(document.cookie).toContain('eg-consent=1.1.opt-in.settings.')
  })
})

import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { ProProvider, type ProValue } from '@/components/ProProvider'
import { UpgradeButton } from './UpgradeButton'
import type { ProStatus } from '@/lib/stripe/pro'

const FREE: ProStatus = { pro: false, reason: 'free', plan: null, currentPeriodEnd: null, cancelAtPeriodEnd: false }
const PRO: ProStatus = {
  pro: true,
  reason: 'subscription',
  plan: 'monthly',
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
}

function renderWith(value: ProValue) {
  return render(
    <ProProvider value={value}>
      <UpgradeButton />
    </ProProvider>,
  )
}

describe('UpgradeButton', () => {
  it('без кассы не рендерит ничего', () => {
    const { container } = renderWith({ status: FREE, billingEnabled: false })
    expect(container.firstChild).toBe(null)
  })

  it('подписчику показывает бейдж Pro', () => {
    const { container } = renderWith({ status: PRO, billingEnabled: true })
    expect(container.querySelector('[data-testid="pro-badge"]')).not.toBe(null)
    expect(container.querySelector('[data-testid="upgrade-button"]')).toBe(null)
  })

  it('бесплатному аккаунту показывает кнопку со ссылкой на тарифы', () => {
    const { container } = renderWith({ status: FREE, billingEnabled: true })
    const button = container.querySelector('[data-testid="upgrade-button"]')
    expect(button).not.toBe(null)
    expect(button?.getAttribute('href')).toBe('/pricing')
  })
})

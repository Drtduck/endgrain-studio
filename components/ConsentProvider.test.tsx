import { afterEach, describe, expect, it } from 'vitest'
import { render, renderHook } from '@testing-library/react'
import { act } from 'react'
import { ConsentBanner } from './ConsentBanner'
import { ConsentProvider, useConsent } from './ConsentProvider'
import type { ConsentDecision } from '@/lib/consent/cookie'

/**
 * reopen() (фикс ревью #7): раньше сбрасывал decision целиком, что гасило
 * аналитику даже при живой granted-cookie, пока баннер снова не закрыт новым
 * выбором. Теперь reopen() трогает только видимость баннера через отдельный
 * forceBannerVisible-флаг, а analytics всё это время остаётся производной от
 * cookie-решения (decision), как было до открытия баннера.
 */

afterEach(() => {
  document.cookie = 'eg-consent=; Path=/; Max-Age=0'
})

describe('ConsentProvider.reopen', () => {
  it('не сбрасывает decision и не гасит analytics при живой granted-cookie', () => {
    const decision: ConsentDecision = { analytics: true, regime: 'opt-in', source: 'banner', at: 1755043200 }
    const { result } = renderHook(() => useConsent(), {
      wrapper: ({ children }) => (
        <ConsentProvider regime="opt-in" initialDecision={decision}>
          {children}
        </ConsentProvider>
      ),
    })

    expect(result.current.analytics).toBe(true)
    expect(result.current.decided).toBe(true)

    act(() => result.current.reopen())

    // Баннер должен снова быть «недорешённым» (decided=false), но analytics -
    // всё ещё true: живая granted-cookie не отзывается только открытием баннера.
    expect(result.current.decided).toBe(false)
    expect(result.current.analytics).toBe(true)
    expect(result.current.decision).toEqual(decision)
  })

  it('reopen показывает баннер поверх живого granted-решения, а новый выбор его закрывает', () => {
    const decision: ConsentDecision = { analytics: true, regime: 'opt-in', source: 'banner', at: 1755043200 }

    function Harness() {
      const { reopen } = useConsent()
      return (
        <>
          <button data-testid="reopen-trigger" onClick={reopen}>
            reopen
          </button>
          <ConsentBanner />
        </>
      )
    }

    const { container } = render(
      <ConsentProvider regime="opt-in" initialDecision={decision}>
        <Harness />
      </ConsentProvider>
    )

    expect(container.querySelector('[data-testid="consent-banner"]')).toBeNull()

    act(() => {
      ;(container.querySelector('[data-testid="reopen-trigger"]') as HTMLButtonElement).click()
    })
    expect(container.querySelector('[data-testid="consent-banner"]')).not.toBeNull()

    act(() => {
      ;(container.querySelector('[data-testid="consent-accept"]') as HTMLButtonElement).click()
    })
    expect(container.querySelector('[data-testid="consent-banner"]')).toBeNull()
  })
})

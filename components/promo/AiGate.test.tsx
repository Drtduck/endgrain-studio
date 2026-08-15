import type { ReactNode } from 'react'
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProProvider } from '@/components/ProProvider'
import { aiAccess } from '@/lib/ai/quota'
import type { ProStatus } from '@/lib/stripe/pro'
import { useAiGate } from './AiGate'

const FREE_STATUS: ProStatus = { pro: false, reason: 'free', plan: null, currentPeriodEnd: null, cancelAtPeriodEnd: false }

function wrapperFor(state: Parameters<typeof aiAccess>[0], used: number, limit: number, credits: number) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ProProvider value={{ status: FREE_STATUS, billingEnabled: true, ai: aiAccess(state, used, limit, credits) }}>
        {children}
      </ProProvider>
    )
  }
}

/**
 * P0-блокер приёмки 15.08.2026: «Осталось 13 из 3 пробных генераций» - на Free
 * с купленными кадрами счётчик оставался в состоянии trial и брал ключ
 * ai.trial.left с limit=3, хотя remaining уже включал купленные кадры.
 */
describe('useAiGate: состояние trial с купленными кадрами (P0-блокер приёмки 15.08.2026)', () => {
  it('чистый пробный тир (без купленных кадров) показывает ai.trial.left', () => {
    const { result } = renderHook(() => useAiGate(null, 'promoShots'), { wrapper: wrapperFor('trial', 0, 3, 0) })
    expect(result.current.noteKey).toBe('ai.trial.left')
    expect(result.current.locked).toBe(false)
  })

  it('trial с купленными кадрами поверх - честная формулировка ai.quota, а не ai.trial.left', () => {
    const { result } = renderHook(() => useAiGate(null, 'promoShots'), { wrapper: wrapperFor('trial', 0, 3, 10) })
    expect(result.current.noteKey).toBe('ai.quota')
    expect(result.current.locked).toBe(false)
    // remaining честно включает и пробные, и купленные - это и есть источник вранья до фикса.
    expect(result.current.params['remaining']).toBe(13)
    expect(result.current.params['credits']).toBe(10)
    expect(result.current.params['free']).toBe(3)
  })
})

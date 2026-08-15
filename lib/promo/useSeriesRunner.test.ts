import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { baseDesign } from '@/lib/engine'
import { useStudio } from '@/lib/store/studio'
import { useSeriesRunner } from './useSeriesRunner'

const createPromoSeriesAction = vi.fn()

vi.mock('@/app/actions/promo', () => ({
  createPromoSeriesAction: (input: unknown) => createPromoSeriesAction(input),
  cancelPromoSeriesAction: () => Promise.resolve({ ok: false, error: 'invalid' }),
  retryPromoShotAction: () => Promise.resolve({ ok: false, error: 'invalid' }),
  editPromoShotAction: () => Promise.resolve({ ok: false, error: 'invalid' }),
}))

/**
 * P0-блокер приёмки 15.08.2026 (слой б): отказ сервера notFound (чужой/битый
 * projectId - типично после смены аккаунта, см. lib/store/persist.test.ts для
 * слоя а) не имеет права быть тишиной. Панель обязана увидеть ошибку в
 * runner.error, а битая привязка к проекту обязана сброситься сама, чтобы
 * следующий клик не бился в ту же стену молча.
 */
describe('useSeriesRunner: отказ notFound сбрасывает битую привязку к проекту', () => {
  beforeEach(() => {
    createPromoSeriesAction.mockReset()
    useStudio.getState().resetStudio(baseDesign())
    useStudio.getState().markProjectSaved('чужой-projectId', useStudio.getState().history.present)
  })

  it('runner.error получает notFound, currentProjectId сбрасывается в null', async () => {
    createPromoSeriesAction.mockResolvedValue({ ok: false, error: 'notFound' })
    const { result } = renderHook(() => useSeriesRunner())

    expect(useStudio.getState().currentProjectId).toBe('чужой-projectId')

    await act(async () => {
      await result.current.start({
        source: 'presets',
        projectId: 'чужой-projectId',
        walletRef: 'ref-1',
        boardPng: 'x',
        shots: [{ kind: 'front' }],
      } as never)
    })

    expect(result.current.error).toBe('notFound')
    expect(useStudio.getState().currentProjectId).toBeNull()
  })

  it('другие отказы (не notFound) не трогают привязку к проекту', async () => {
    createPromoSeriesAction.mockResolvedValue({ ok: false, error: 'rateLimited' })
    const { result } = renderHook(() => useSeriesRunner())

    await act(async () => {
      await result.current.start({
        source: 'presets',
        projectId: 'чужой-projectId',
        walletRef: 'ref-1',
        boardPng: 'x',
        shots: [{ kind: 'front' }],
      } as never)
    })

    expect(result.current.error).toBe('rateLimited')
    expect(useStudio.getState().currentProjectId).toBe('чужой-projectId')
  })
})

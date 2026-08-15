import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LandingLocaleToggle } from './LandingLocaleToggle'

const setLandingLocaleAction = vi.fn(async (_next: string) => {})
vi.mock('@/app/actions/locale', () => ({
  setLandingLocaleAction: (next: string) => setLandingLocaleAction(next),
}))

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

describe('LandingLocaleToggle', () => {
  beforeEach(() => {
    setLandingLocaleAction.mockClear()
    refresh.mockClear()
  })

  it('после смены языка обновляет cookie на сервере и перечитывает серверные компоненты', async () => {
    render(<LandingLocaleToggle locale="ru" />)
    fireEvent.click(screen.getByTestId('landing-locale-en'))

    await waitFor(() => expect(setLandingLocaleAction).toHaveBeenCalledWith('en'))
    // refresh() обязан идти после того, как серверный экшен дописал cookie,
    // иначе следующий рендер снова прочитает старую локаль.
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
  })

  it('клик по уже активному языку ничего не меняет', () => {
    render(<LandingLocaleToggle locale="ru" />)
    fireEvent.click(screen.getByTestId('landing-locale-ru'))
    expect(setLandingLocaleAction).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })
})

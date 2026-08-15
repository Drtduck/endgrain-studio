import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { makeCheckerboard } from '@/lib/designs/samples'
import { selectDesign, useStudio } from '@/lib/store/studio'
import { SaveProjectButton } from './SaveProjectButton'

const upsertProjectAction = vi.fn()

vi.mock('@/app/actions/projects', () => ({
  upsertProjectAction: (...args: unknown[]) => upsertProjectAction(...args),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}))

describe('SaveProjectButton', () => {
  beforeEach(() => {
    upsertProjectAction.mockReset()
    act(() => {
      useStudio.getState().resetStudio(makeCheckerboard({ cols: 2, rows: 2 }))
    })
  })

  it('первое нажатие создаёт проект через upsertProjectAction (projectId: null) и запоминает id в сторе', async () => {
    upsertProjectAction.mockResolvedValue({
      ok: true,
      data: { id: '11111111-1111-1111-1111-111111111111', name: 'Шахматка', updatedAt: new Date().toISOString() },
    })
    const { container } = render(<SaveProjectButton />)

    fireEvent.click(container.querySelector('[data-testid="project-save"]') as Element)

    await waitFor(() => expect(upsertProjectAction).toHaveBeenCalled())
    const [arg] = upsertProjectAction.mock.calls[0] as [{ projectId: string | null }]
    expect(arg.projectId).toBeNull()
    await waitFor(() => expect(useStudio.getState().currentProjectId).toBe('11111111-1111-1111-1111-111111111111'))
    await waitFor(() => expect(container.textContent).toContain('Сохранено'))
  })

  it('повторное нажатие после сохранения шлёт существующий projectId, а не плодит новый проект', async () => {
    act(() => {
      useStudio.getState().markProjectSaved('22222222-2222-2222-2222-222222222222', selectDesign(useStudio.getState()))
    })
    upsertProjectAction.mockResolvedValue({
      ok: true,
      data: { id: '22222222-2222-2222-2222-222222222222', name: 'Шахматка', updatedAt: new Date().toISOString() },
    })
    const { container } = render(<SaveProjectButton />)

    fireEvent.click(container.querySelector('[data-testid="project-save"]') as Element)

    await waitFor(() => expect(upsertProjectAction).toHaveBeenCalled())
    const [arg] = upsertProjectAction.mock.calls[0] as [{ projectId: string | null }]
    expect(arg.projectId).toBe('22222222-2222-2222-2222-222222222222')
  })

  it('редактирование документа после сохранения показывает "несохранённые изменения"', async () => {
    act(() => {
      useStudio.getState().markProjectSaved('33333333-3333-3333-3333-333333333333', selectDesign(useStudio.getState()))
    })
    const { container } = render(<SaveProjectButton />)
    expect(container.textContent).toContain('Сохранено')

    act(() => {
      useStudio.getState().setBoardWidthMm(500)
    })

    await waitFor(() => expect(container.textContent).toContain('Есть несохранённые изменения'))
  })

  it('unauthenticated рисует объяснение и ссылку на вход вместо общей ошибки', async () => {
    upsertProjectAction.mockResolvedValue({ ok: false, error: 'unauthenticated' })
    const { container } = render(<SaveProjectButton />)

    fireEvent.click(container.querySelector('[data-testid="project-save"]') as Element)

    await waitFor(() => {
      const alert = container.querySelector('[data-testid="project-save-error"]')
      expect(alert).not.toBe(null)
      expect(alert?.textContent).toContain('Чтобы сохранить проект в облако, нужно войти в аккаунт')
    })
    const link = container.querySelector('[data-testid="project-save-login"]')
    expect(link).not.toBe(null)
    expect(link?.getAttribute('href')).toContain('/login')
  })

  it('ошибка failed рисует role=alert с русским текстом', async () => {
    upsertProjectAction.mockResolvedValue({ ok: false, error: 'failed' })
    const { container } = render(<SaveProjectButton />)

    fireEvent.click(container.querySelector('[data-testid="project-save"]') as Element)

    await waitFor(() => {
      const alert = container.querySelector('[role="alert"]')
      expect(alert).not.toBe(null)
      expect(alert?.textContent).toBe('Облако не ответило. Попробуйте ещё раз')
    })
  })
})

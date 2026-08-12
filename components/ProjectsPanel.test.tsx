import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { makeCheckerboard } from '@/lib/designs/samples'
import { selectDesign, useStudio } from '@/lib/store/studio'
import { ProjectsPanel } from './ProjectsPanel'

const listProjectsAction = vi.fn()
const saveProjectAction = vi.fn()
const loadProjectAction = vi.fn()
const deleteProjectAction = vi.fn()

vi.mock('@/app/actions/projects', () => ({
  listProjectsAction: (...args: unknown[]) => listProjectsAction(...args),
  saveProjectAction: (...args: unknown[]) => saveProjectAction(...args),
  loadProjectAction: (...args: unknown[]) => loadProjectAction(...args),
  deleteProjectAction: (...args: unknown[]) => deleteProjectAction(...args),
}))

describe('ProjectsPanel', () => {
  beforeEach(() => {
    listProjectsAction.mockReset()
    saveProjectAction.mockReset()
    loadProjectAction.mockReset()
    deleteProjectAction.mockReset()
    act(() => {
      useStudio.getState().resetStudio(makeCheckerboard({ cols: 2, rows: 2 }))
    })
  })

  it('пустой ответ показывает подсказку', async () => {
    listProjectsAction.mockResolvedValue({ ok: true, data: [] })
    const { container } = render(<ProjectsPanel />)
    fireEvent.click(container.querySelector('[data-testid="projects-refresh"]') as Element)
    await waitFor(() => expect(listProjectsAction).toHaveBeenCalled())
    await waitFor(() => expect(container.textContent).toContain('Пока ни одного сохранённого проекта'))
  })

  it('сохранение зовёт экшен с именем из поля и текущим документом из стора', async () => {
    listProjectsAction.mockResolvedValue({ ok: true, data: [] })
    saveProjectAction.mockResolvedValue({
      ok: true,
      data: { id: '11111111-1111-1111-1111-111111111111', name: 'Моя доска', updatedAt: new Date().toISOString() },
    })
    const { container } = render(<ProjectsPanel />)

    const nameInput = container.querySelector('[data-testid="projects-name"]') as HTMLInputElement
    fireEvent.change(nameInput, { target: { value: 'Моя доска' } })
    fireEvent.click(container.querySelector('[data-testid="projects-save"]') as Element)

    await waitFor(() => expect(saveProjectAction).toHaveBeenCalled())
    const [name, design] = saveProjectAction.mock.calls[0] as [string, unknown]
    expect(name).toBe('Моя доска')
    expect(design).toBe(selectDesign(useStudio.getState()))
  })

  it('клик по кнопке открытия зовёт экшен, меняет документ и переключает вид', async () => {
    const savedDesign = { ...makeCheckerboard({ cols: 3, rows: 3 }), id: 'loaded-design' }
    listProjectsAction.mockResolvedValue({
      ok: true,
      data: [{ id: '22222222-2222-2222-2222-222222222222', name: 'Проект', updatedAt: new Date().toISOString() }],
    })
    loadProjectAction.mockResolvedValue({ ok: true, data: savedDesign })

    const { container } = render(<ProjectsPanel />)
    fireEvent.click(container.querySelector('[data-testid="projects-refresh"]') as Element)
    await waitFor(() =>
      expect(container.querySelector('[data-testid="project-load-22222222-2222-2222-2222-222222222222"]')).not.toBe(null),
    )

    act(() => { useStudio.getState().setView('projects') })
    fireEvent.click(container.querySelector('[data-testid="project-load-22222222-2222-2222-2222-222222222222"]') as Element)

    await waitFor(() => expect(loadProjectAction).toHaveBeenCalledWith('22222222-2222-2222-2222-222222222222'))
    await waitFor(() => expect(selectDesign(useStudio.getState()).id).toBe('loaded-design'))
    expect(useStudio.getState().view).toBe('editor')
  })

  it('ошибка failed рисует role=alert с русским текстом', async () => {
    listProjectsAction.mockResolvedValue({ ok: false, error: 'failed' })
    const { container } = render(<ProjectsPanel />)
    fireEvent.click(container.querySelector('[data-testid="projects-refresh"]') as Element)
    await waitFor(() => {
      const alert = container.querySelector('[role="alert"]')
      expect(alert).not.toBe(null)
      expect(alert?.textContent).toBe('Облако не ответило. Попробуйте ещё раз')
    })
  })

  it('удаление требует двух кликов', async () => {
    listProjectsAction.mockResolvedValue({
      ok: true,
      data: [{ id: '33333333-3333-3333-3333-333333333333', name: 'Проект', updatedAt: new Date().toISOString() }],
    })
    deleteProjectAction.mockResolvedValue({ ok: true, data: null })

    const { container } = render(<ProjectsPanel />)
    fireEvent.click(container.querySelector('[data-testid="projects-refresh"]') as Element)
    const testId = 'project-delete-33333333-3333-3333-3333-333333333333'
    await waitFor(() => expect(container.querySelector(`[data-testid="${testId}"]`)).not.toBe(null))

    const button = container.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement
    fireEvent.click(button)
    expect(deleteProjectAction).not.toHaveBeenCalled()
    expect(button.textContent).toBe('Точно удалить?')

    fireEvent.click(button)
    await waitFor(() => expect(deleteProjectAction).toHaveBeenCalledWith('33333333-3333-3333-3333-333333333333'))
  })
})

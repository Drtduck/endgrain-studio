import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { ProProvider } from '@/components/ProProvider'
import { aiAccess } from '@/lib/ai/quota'
import { makeCheckerboard } from '@/lib/designs/samples'
import type { ProStatus } from '@/lib/stripe/pro'
import { useProjectsStore } from '@/lib/store/projects'
import { selectDesign, useStudio } from '@/lib/store/studio'
import { ProjectsPanel } from './ProjectsPanel'

const listProjectsAction = vi.fn()
const saveProjectAction = vi.fn()
const loadProjectAction = vi.fn()
const deleteProjectAction = vi.fn()

/**
 * Кнопки списка заблокированы, пока не закрылся startTransition обновления списка.
 * Под нагрузкой (полный прогон в несколько воркеров) элемент успевает появиться
 * раньше, чем снимается pending, и клик по disabled уходит в пустоту. Поэтому
 * ждём именно активную кнопку, а не только её присутствие в DOM.
 */
async function enabledButton(container: HTMLElement, testId: string): Promise<HTMLButtonElement> {
  let button: HTMLButtonElement | null = null
  await waitFor(() => {
    button = container.querySelector(`[data-testid="${testId}"]`)
    expect(button).not.toBe(null)
    expect(button?.disabled).toBe(false)
  })
  return button as unknown as HTMLButtonElement
}

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
      // Список - общий стор (lib/store/projects.ts), а не локальный useState:
      // без сброса тесты видят проекты, оставленные предыдущим кейсом.
      useProjectsStore.setState({ items: [], loaded: false })
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
    const loadButton = await enabledButton(container, 'project-load-22222222-2222-2222-2222-222222222222')

    act(() => { useStudio.getState().setView('projects') })
    fireEvent.click(loadButton)

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

  // Мелочь 2 (приёмка 15.08.2026): раньше сохранение кнопкой SaveProjectButton в
  // редакторе не имело способа обновить список внутри ProjectsPanel - теперь оба
  // пишут в общий useProjectsStore, и панель видит проект без похода на сервер.
  it('проект, добавленный извне в общий стор (как это делает SaveProjectButton), виден без "Обновить список"', () => {
    // Автозагрузка при открытии вкладки (баг приёмки 15.08.2026) висит и не
    // отвечает: проверяем ровно то, ради чего тест писался - содержимое стора
    // видно сразу, до любого ответа сервера и без клика по «Обновить список».
    listProjectsAction.mockReturnValue(new Promise(() => {}))
    act(() => {
      useProjectsStore.getState().upsertItem({
        id: '55555555-5555-5555-5555-555555555555',
        name: 'Сохранено из редактора',
        updatedAt: new Date().toISOString(),
      })
    })
    const { container } = render(<ProjectsPanel />)
    expect(container.textContent).toContain('Сохранено из редактора')
    expect(container.querySelector('[data-testid="projects-refresh"]')).not.toBe(null)
  })

  it('удаление требует двух кликов', async () => {
    listProjectsAction.mockResolvedValue({
      ok: true,
      data: [{ id: '33333333-3333-3333-3333-333333333333', name: 'Проект', updatedAt: new Date().toISOString() }],
    })
    deleteProjectAction.mockResolvedValue({ ok: true, data: null })

    const { container } = render(<ProjectsPanel />)
    fireEvent.click(container.querySelector('[data-testid="projects-refresh"]') as Element)
    const button = await enabledButton(container, 'project-delete-33333333-3333-3333-3333-333333333333')
    fireEvent.click(button)
    expect(deleteProjectAction).not.toHaveBeenCalled()
    expect(button.textContent).toBe('Точно удалить?')

    fireEvent.click(button)
    await waitFor(() => expect(deleteProjectAction).toHaveBeenCalledWith('33333333-3333-3333-3333-333333333333'))
  })
})

/**
 * Баг ручной приёмки 15.08.2026: вкладка «Мои проекты» открывалась пустой со
 * счётчиком «Занято 0 из 3», хотя в облаке лежали три проекта, и сохранение
 * тут же упиралось в серверный лимит. Список грузился только по клику по
 * «Обновить список», а счётчик мест считался по пустому локальному списку.
 */
describe('ProjectsPanel: первая загрузка при открытии вкладки', () => {
  const FREE_STATUS: ProStatus = { pro: false, reason: 'free', plan: null, currentPeriodEnd: null, cancelAtPeriodEnd: false }

  function renderFree() {
    return render(
      <ProProvider value={{ status: FREE_STATUS, billingEnabled: true, ai: aiAccess('mock') }}>
        <ProjectsPanel />
      </ProProvider>,
    )
  }

  beforeEach(() => {
    listProjectsAction.mockReset()
    act(() => {
      useStudio.getState().resetStudio(makeCheckerboard({ cols: 2, rows: 2 }))
      useProjectsStore.setState({ items: [], loaded: false })
    })
  })

  it('список приезжает сам, без клика по «Обновить список»', async () => {
    listProjectsAction.mockResolvedValue({
      ok: true,
      data: [{ id: '66666666-6666-6666-6666-666666666666', name: 'Доска из облака', updatedAt: new Date().toISOString() }],
    })
    const { container } = renderFree()
    await waitFor(() => expect(container.textContent).toContain('Доска из облака'))
    expect(listProjectsAction).toHaveBeenCalled()
  })

  it('счётчик мест молчит, пока список не приехал, и показывает серверное число после', async () => {
    const items = [1, 2, 3].map((n) => ({ id: `7777777${n}-7777-7777-7777-777777777777`, name: `Доска ${n}`, updatedAt: new Date().toISOString() }))
    listProjectsAction.mockResolvedValue({ ok: true, data: items })
    const { container } = renderFree()
    // До ответа сервера врать «Занято 0 из 3» нельзя: мест может не быть вовсе.
    expect(container.querySelector('[data-testid="projects-limit-hint"]')).toBe(null)
    await waitFor(() => {
      const hint = container.querySelector('[data-testid="projects-limit-hint"]')
      expect(hint?.textContent).toBe('Занято 3 из 3 мест бесплатного плана')
    })
  })
})

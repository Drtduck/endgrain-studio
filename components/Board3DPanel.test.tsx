import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { baseDesign, stripsPanel } from '@/lib/engine/fixtures'
import { makeCheckerboard } from '@/lib/designs/samples'
import { useStudio } from '@/lib/store/studio'
import { Board3DPanel } from './Board3DPanel'

vi.mock('@/components/Board3D', () => ({
  Board3D: ({ label }: { label: string }) => <div data-testid="board3d-stub">{label}</div>,
}))

describe('Board3DPanel', () => {
  beforeEach(() => {
    useStudio.getState().resetStudio(makeCheckerboard({ cols: 2, rows: 2 }))
  })

  it('подгружает сцену и подписывает её для скринридера', async () => {
    render(<Board3DPanel />)
    await waitFor(() => expect(screen.getByTestId('board3d-stub')).toBeDefined())
    expect(screen.getByTestId('board3d-stub').textContent).toBe('трёхмерное превью доски')
    expect(screen.getByTestId('view3d')).toBeDefined()
  })

  it('показывает подсказку по управлению на языке интерфейса', async () => {
    render(<Board3DPanel />)
    await waitFor(() => expect(screen.getByTestId('board3d-stub')).toBeDefined())
    expect(screen.getByText(/Крутите мышью/)).toBeDefined()
    act(() => { useStudio.getState().setLocale('en') })
    expect(screen.getByText(/Drag to orbit/)).toBeDefined()
  })

  it('не показывает предупреждение об усечении для обычной доски', async () => {
    render(<Board3DPanel />)
    await waitFor(() => expect(screen.getByTestId('board3d-stub')).toBeDefined())
    expect(screen.queryByText(/сцена ограничена бюджетом/)).toBe(null)
  })

  it('показывает предупреждение, когда модель реально усечена бюджетом ячеек', async () => {
    // Суб-миллиметровые полосы под sliceRef: тот же приём, что бьёт в MAX_CELLS в compile.test.ts.
    act(() => {
      useStudio.getState().loadDesign(
        baseDesign({
          panels: [
            stripsPanel('Q', ['walnut', 'maple'], 0.001),
            { id: 'P', elements: [{ kind: 'sliceRef', panelId: 'Q', thicknessMm: 20, angleDeg: 0, offsetMm: 0 }] },
          ],
          rows: [{ id: 'r1', panelId: 'P', thicknessMm: 40, angleDeg: 0, flip: false, mirror: false, trimMm: 5 }],
        }),
      )
    })
    render(<Board3DPanel />)
    await waitFor(() => expect(screen.getByTestId('board3d-stub')).toBeDefined())
    expect(screen.getByText(/сцена ограничена бюджетом/)).toBeDefined()
  })
})

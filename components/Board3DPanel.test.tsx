import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
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
})

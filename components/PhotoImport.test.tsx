import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { makeCheckerboard } from '@/lib/designs/samples'
import { useStudio } from '@/lib/store/studio'
import type { PixelGrid } from '@/lib/photo'

// jsdom не умеет canvas: разбор файла подменяем, вся арифметика уже покрыта в lib/photo.
vi.mock('./photoDecode', () => ({
  ACCEPTED_TYPES: ['image/png'],
  isImageFile: (file: File) => file.type.startsWith('image/'),
  fitGrid: () => ({ cols: 8, rows: 6 }),
  decodeToGrid: vi.fn(async () => bandsGrid()),
}))

import { PhotoImport } from './PhotoImport'
import { decodeToGrid } from './photoDecode'

// Шесть разных цветов по рядам: при трёх и пяти запрошенных породах k-means должен
// давать реально разные кластеры, а не упираться в потолок различимых цветов заготовки.
const ROW_BANDS: readonly (readonly [number, number, number])[] = [
  [235, 225, 200],
  [210, 180, 140],
  [180, 140, 90],
  [150, 95, 60],
  [100, 65, 40],
  [45, 35, 30],
]

function bandsGrid(): PixelGrid {
  const cols = 8
  const rows = 6
  const rgba = new Uint8ClampedArray(cols * rows * 4)
  for (let row = 0; row < rows; row += 1) {
    const band = ROW_BANDS[row] ?? [0, 0, 0]
    for (let col = 0; col < cols; col += 1) {
      const offset = (row * cols + col) * 4
      rgba[offset] = band[0] ?? 0
      rgba[offset + 1] = band[1] ?? 0
      rgba[offset + 2] = band[2] ?? 0
      rgba[offset + 3] = 255
    }
  }
  return { cols, rows, rgba }
}

function pngFile(name = 'demo.png'): File {
  return new File([new Uint8Array([137, 80, 78, 71])], name, { type: 'image/png' })
}

async function upload(): Promise<void> {
  const input = screen.getByTestId('photo-file')
  fireEvent.change(input, { target: { files: [pngFile()] } })
  await waitFor(() => expect(screen.getByTestId('photo-preview')).toBeTruthy())
}

describe('PhotoImport', () => {
  beforeEach(() => {
    useStudio.getState().resetStudio(makeCheckerboard())
    vi.mocked(decodeToGrid).mockClear()
  })

  it('до загрузки показывает зону перетаскивания и не показывает превью', () => {
    render(<PhotoImport />)
    expect(screen.getByTestId('photo-panel')).toBeTruthy()
    expect(screen.getByTestId('photo-dropzone')).toBeTruthy()
    expect(screen.queryByTestId('photo-preview')).toBe(null)
  })

  it('после загрузки рисует превью доски', async () => {
    const { container } = render(<PhotoImport />)
    await upload()
    expect(decodeToGrid).toHaveBeenCalledTimes(1)
    expect(container.querySelectorAll('svg rect').length).toBeGreaterThan(10)
  })

  it('кладёт разобранную картинку в стор', async () => {
    render(<PhotoImport />)
    await upload()
    expect(useStudio.getState().photo?.fileName).toBe('demo.png')
    expect(useStudio.getState().photo?.grid.cols).toBe(8)
  })

  it('ползунок числа пород меняет узор', async () => {
    const { container } = render(<PhotoImport />)
    await upload()
    const before = container.querySelector('svg')?.innerHTML
    fireEvent.change(screen.getByTestId('photo-colors'), { target: { value: '5' } })
    await waitFor(() => expect(container.querySelector('svg')?.innerHTML).not.toBe(before))
  })

  it('ползунок щитов меняет число склеек в подписи', async () => {
    render(<PhotoImport />)
    await upload()
    fireEvent.change(screen.getByTestId('photo-panels'), { target: { value: '6' } })
    const many = screen.getByTestId('photo-stats').textContent ?? ''
    fireEvent.change(screen.getByTestId('photo-panels'), { target: { value: '1' } })
    const few = screen.getByTestId('photo-stats').textContent ?? ''
    expect(few).not.toBe(many)
  })

  it('перетаскивание файла работает так же, как выбор', async () => {
    render(<PhotoImport />)
    const zone = screen.getByTestId('photo-dropzone')
    fireEvent.drop(zone, { dataTransfer: { files: [pngFile('drag.png')], types: ['Files'] } })
    await waitFor(() => expect(screen.getByTestId('photo-preview')).toBeTruthy())
    expect(useStudio.getState().photo?.fileName).toBe('drag.png')
  })

  it('не-картинку отвергает с внятным текстом', async () => {
    render(<PhotoImport />)
    const input = screen.getByTestId('photo-file')
    fireEvent.change(input, { target: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] } })
    await waitFor(() => expect(screen.getByTestId('photo-error')).toBeTruthy())
    expect(decodeToGrid).not.toHaveBeenCalled()
  })

  it('сбой разбора показывает ошибку, а не пустой экран', async () => {
    vi.mocked(decodeToGrid).mockRejectedValueOnce(new Error('битый файл'))
    render(<PhotoImport />)
    fireEvent.change(screen.getByTestId('photo-file'), { target: { files: [pngFile()] } })
    await waitFor(() => expect(screen.getByTestId('photo-error')).toBeTruthy())
  })

  it('на чистом документе применяет узор сразу', async () => {
    render(<PhotoImport />)
    await upload()
    fireEvent.click(screen.getByTestId('photo-apply'))
    expect(screen.queryByTestId('photo-confirm-dialog')).toBe(null)
    expect(useStudio.getState().view).toBe('editor')
    expect(useStudio.getState().documentTouched).toBe(true)
  })

  it('поверх правок сначала спрашивает', async () => {
    act(() => {
      useStudio.getState().setBoardThicknessMm(52)
    })
    render(<PhotoImport />)
    await upload()
    fireEvent.click(screen.getByTestId('photo-apply'))
    expect(screen.getByTestId('photo-confirm-dialog')).toBeTruthy()
    fireEvent.click(screen.getByTestId('photo-confirm'))
    expect(useStudio.getState().view).toBe('editor')
  })

  it('картинка переживает уход на другую вкладку', async () => {
    const { unmount } = render(<PhotoImport />)
    await upload()
    unmount()
    render(<PhotoImport />)
    expect(screen.getByTestId('photo-preview')).toBeTruthy()
    expect(decodeToGrid).toHaveBeenCalledTimes(1)
  })
})

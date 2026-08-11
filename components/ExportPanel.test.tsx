import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ExportPanel } from './ExportPanel'
import { useStudio } from '@/lib/store/studio'

const downloadBlob = vi.fn()
const downloadText = vi.fn()
const svgToPngBlob = vi.fn(async () => new Blob(['png'], { type: 'image/png' }))
const buildInstructionPdf = vi.fn(async () => new Blob(['%PDF-1.3'], { type: 'application/pdf' }))

vi.mock('@/lib/export/download', () => ({ downloadBlob: (...a: unknown[]) => downloadBlob(...a), downloadText: (...a: unknown[]) => downloadText(...a) }))
vi.mock('@/lib/export/png', () => ({ svgToPngBlob: () => svgToPngBlob() }))
vi.mock('@/lib/export/pdf', () => ({ buildInstructionPdf: () => buildInstructionPdf() }))

// truncatedFlag живёт вне модуля-мока через vi.hoisted: фабрика vi.mock поднимается над
// импортами, обычный `let` в этом файле попал бы в TDZ на момент её выполнения.
const { truncatedFlag } = vi.hoisted(() => ({ truncatedFlag: { value: false } }))
vi.mock('@/lib/store/derived', async () => {
  const actual = await vi.importActual<typeof import('@/lib/store/derived')>('@/lib/store/derived')
  return {
    ...actual,
    useDerived: () => {
      const real = actual.useDerived()
      return truncatedFlag.value ? { ...real, model: { ...real.model, truncated: true } } : real
    },
  }
})

describe('ExportPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    truncatedFlag.value = false
    useStudio.getState().resetStudio()
  })

  it('показывает четыре кнопки', () => {
    render(<ExportPanel />)
    for (const id of ['export-png', 'export-svg', 'export-csv', 'export-pdf']) {
      expect(screen.getByTestId(id)).toBeInTheDocument()
    }
  })

  it('SVG скачивается синхронно и с расширением .svg', () => {
    render(<ExportPanel />)
    fireEvent.click(screen.getByTestId('export-svg'))
    expect(downloadText).toHaveBeenCalledTimes(1)
    expect(downloadText.mock.calls[0]?.[1]).toMatch(/\.svg$/)
    expect(String(downloadText.mock.calls[0]?.[0])).toContain('<svg')
  })

  it('CSV уходит с BOM и с точкой с запятой', () => {
    render(<ExportPanel />)
    fireEvent.click(screen.getByTestId('export-csv'))
    const [content, name, mime] = downloadText.mock.calls[0] ?? []
    expect(String(content).charCodeAt(0)).toBe(0xfeff)
    expect(String(content)).toContain(';')
    expect(String(name)).toMatch(/\.csv$/)
    expect(String(mime)).toContain('text/csv')
  })

  it('PNG проходит через растеризатор и отдаёт blob', async () => {
    render(<ExportPanel />)
    fireEvent.click(screen.getByTestId('export-png'))
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1))
    expect(svgToPngBlob).toHaveBeenCalledTimes(1)
    expect(downloadBlob.mock.calls[0]?.[1]).toMatch(/\.png$/)
  })

  it('во время долгой сборки кнопки заблокированы', async () => {
    let release = (): void => {}
    buildInstructionPdf.mockImplementationOnce(
      () => new Promise<Blob>((resolve) => { release = () => resolve(new Blob(['%PDF'])) }),
    )
    render(<ExportPanel />)
    fireEvent.click(screen.getByTestId('export-pdf'))
    await waitFor(() => expect(screen.getByTestId('export-pdf')).toBeDisabled())
    expect(screen.getByTestId('export-png')).toBeDisabled()
    await act(async () => { release() })
    await waitFor(() => expect(screen.getByTestId('export-pdf')).toBeEnabled())
  })

  it('падение экспорта показывает сообщение и разблокирует кнопки', async () => {
    buildInstructionPdf.mockRejectedValueOnce(new Error('boom'))
    render(<ExportPanel />)
    fireEvent.click(screen.getByTestId('export-pdf'))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByTestId('export-pdf')).toBeEnabled()
    expect(downloadBlob).not.toHaveBeenCalled()
  })

  it('SVG и PNG подпись несёт предупреждение об усечённой модели', async () => {
    truncatedFlag.value = true
    render(<ExportPanel />)

    fireEvent.click(screen.getByTestId('export-svg'))
    expect(String(downloadText.mock.calls[0]?.[0])).toContain('обрезана по лимиту ячеек')

    fireEvent.click(screen.getByTestId('export-png'))
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1))
  })

  it('следует локали интерфейса', () => {
    render(<ExportPanel />)
    expect(screen.getByText('Экспорт')).toBeInTheDocument()
    act(() => { useStudio.getState().setLocale('en') })
    expect(screen.getByText('Export')).toBeInTheDocument()
  })
})

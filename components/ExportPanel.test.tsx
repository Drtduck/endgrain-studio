import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ExportPanel } from './ExportPanel'
import { useStudio } from '@/lib/store/studio'

const downloadText = vi.fn()

vi.mock('@/lib/export/download', () => ({ downloadText: (...a: unknown[]) => downloadText(...a) }))

describe('ExportPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useStudio.getState().resetStudio()
  })

  it('показывает две кнопки: печать и CSV', () => {
    render(<ExportPanel />)
    expect(screen.getByTestId('export-print')).toBeInTheDocument()
    expect(screen.getByTestId('export-csv')).toBeInTheDocument()
  })

  it('растровых и векторных выгрузок больше нет', () => {
    render(<ExportPanel />)
    for (const id of ['export-png', 'export-png-hd', 'export-svg', 'export-pdf']) {
      expect(screen.queryByTestId(id)).toBeNull()
    }
  })

  it('кнопка печати открывает /print с проектом в хэше', () => {
    const open = vi.fn()
    vi.stubGlobal('open', open)
    render(<ExportPanel />)
    fireEvent.click(screen.getByTestId('export-print'))
    expect(open).toHaveBeenCalledTimes(1)
    const url = String(open.mock.calls[0]?.[0])
    expect(url.startsWith('/print#')).toBe(true)
    expect(url.length).toBeGreaterThan('/print#'.length)
    expect(open.mock.calls[0]?.[1]).toBe('_blank')
    vi.unstubAllGlobals()
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

  it('падение экспорта показывает сообщение', () => {
    downloadText.mockImplementationOnce(() => { throw new Error('boom') })
    render(<ExportPanel />)
    fireEvent.click(screen.getByTestId('export-csv'))
    expect(screen.getByTestId('export-error')).toBeInTheDocument()
  })

  it('следует локали интерфейса', () => {
    render(<ExportPanel />)
    expect(screen.getByText('Экспорт')).toBeInTheDocument()
    act(() => { useStudio.getState().setLocale('en') })
    expect(screen.getByText('Export')).toBeInTheDocument()
  })
})

import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProProvider } from '@/components/ProProvider'
import { aiAccess } from '@/lib/ai/quota'
import { encodeDesignToHash } from '@/lib/persist'
import { selectDesign, useStudio } from '@/lib/store/studio'
import { PrintInstruction } from './PrintInstruction'

function currentHash(): string {
  return encodeDesignToHash(selectDesign(useStudio.getState()))
}

function setUrl(hash: string, search = ''): void {
  window.history.replaceState(null, '', `/print${search}${hash === '' ? '' : `#${hash}`}`)
}

function renderPro(pro: boolean) {
  return render(
    <ProProvider
      value={{
        status: { pro, reason: pro ? 'flag' : 'free', plan: null, currentPeriodEnd: null, cancelAtPeriodEnd: false },
        billingEnabled: true,
        ai: aiAccess('mock'),
      }}
    >
      <PrintInstruction />
    </ProProvider>,
  )
}

describe('PrintInstruction', () => {
  beforeEach(() => {
    useStudio.getState().resetStudio()
    window.localStorage.clear()
    setUrl('')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('без проекта показывает подсказку вместо документа', async () => {
    renderPro(true)
    await waitFor(() => expect(screen.getByTestId('print-empty')).toBeInTheDocument())
    expect(screen.queryByTestId('print-preview')).toBeNull()
  })

  it('поднимает проект из хэша и рисует все разделы инструкции', async () => {
    setUrl(currentHash())
    renderPro(true)

    await waitFor(() => expect(screen.getByTestId('print-preview')).toBeInTheDocument())
    expect(screen.getByTestId('print-brand')).toBeInTheDocument()
    expect(screen.getByTestId('print-brand').querySelector('img')?.getAttribute('src')).toBe('/brand/beaver-mark.png')
    expect(screen.getByTestId('print-preview').querySelector('svg')).not.toBeNull()
    for (const id of ['print-specs', 'print-species', 'print-cutmap', 'print-steps', 'print-rows']) {
      expect(screen.getByTestId(id)).toBeInTheDocument()
    }
    // Шаги сборки это нумерованный список, а не пустая секция.
    expect(screen.getByTestId('print-steps').querySelectorAll('li').length).toBeGreaterThan(0)
  })

  // Мелочь 5 (приёмка 15.08.2026): раздел «Ряды доски» рисовал восемь одинаковых
  // серых полосок без буквы щита - непонятно, какая полоска в какую панель идёт.
  it('каждый ряд подписан буквой щита', async () => {
    setUrl(currentHash())
    renderPro(true)
    await waitFor(() => expect(screen.getByTestId('print-rows')).toBeInTheDocument())
    const rowItems = screen.getByTestId('print-rows').querySelectorAll('ul > li')
    expect(rowItems.length).toBeGreaterThan(0)
    for (const li of Array.from(rowItems)) {
      // Вторая колонка (после номера ряда) - буква щита, непустая строка.
      const panelLabel = li.querySelectorAll('span')[1]?.textContent ?? ''
      expect(panelLabel.trim()).not.toBe('')
    }
  })

  it('поднимает проект из localStorage, когда хэша нет', async () => {
    const { saveToLocalStorage } = await import('@/lib/persist')
    saveToLocalStorage(selectDesign(useStudio.getState()))
    renderPro(true)
    await waitFor(() => expect(screen.getByTestId('print-preview')).toBeInTheDocument())
  })

  it('без Pro в подвале появляется строка про Endgrain App, с Pro её нет', async () => {
    setUrl(currentHash())
    const free = renderPro(false)
    await waitFor(() => expect(screen.getByTestId('print-promo')).toBeInTheDocument())
    free.unmount()

    renderPro(true)
    await waitFor(() => expect(screen.getByTestId('print-preview')).toBeInTheDocument())
    expect(screen.queryByTestId('print-promo')).toBeNull()
  })

  it('кнопка печати зовёт диалог браузера', async () => {
    const print = vi.fn()
    vi.stubGlobal('print', print)
    setUrl(currentHash())
    renderPro(true)
    await waitFor(() => expect(screen.getByTestId('print-now')).toBeInTheDocument())
    screen.getByTestId('print-now').click()
    expect(print).toHaveBeenCalledTimes(1)
  })

  it('autoprint=1 открывает диалог печати сам', async () => {
    const print = vi.fn()
    vi.stubGlobal('print', print)
    vi.useFakeTimers()
    setUrl(currentHash(), '?autoprint=1')
    renderPro(true)
    await vi.advanceTimersByTimeAsync(500)
    expect(print).toHaveBeenCalledTimes(1)
  })

  it('без autoprint диалог сам не открывается', async () => {
    const print = vi.fn()
    vi.stubGlobal('print', print)
    vi.useFakeTimers()
    setUrl(currentHash())
    renderPro(true)
    await vi.advanceTimersByTimeAsync(500)
    expect(print).not.toHaveBeenCalled()
  })
})

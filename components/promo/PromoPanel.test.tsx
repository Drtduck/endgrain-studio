import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MerchResult, PromoResult } from '@/lib/promo/types'
import { useStudio } from '@/lib/store/studio'
import { PromoPanel } from './PromoPanel'

const promoResult = { current: { ok: true, mock: true, kinds: ['hero', 'lifestyle', 'macro', 'package'] } as PromoResult }
const merchResult = { current: { printful: false } as MerchResult }

vi.mock('@/app/actions/promo', () => ({
  generatePromoShotsAction: () => Promise.resolve(promoResult.current),
  createMerchMockupsAction: () => Promise.resolve(merchResult.current),
}))

// Растеризация живёт в канвасе, которого в jsdom нет: подменяем на пустой blob.
vi.mock('@/lib/export/png', () => ({ svgToPngBlob: () => Promise.resolve(new Blob(['png'], { type: 'image/png' })) }))

describe('PromoPanel', () => {
  beforeEach(() => {
    promoResult.current = { ok: true, mock: true, kinds: ['hero', 'lifestyle', 'macro', 'package'] }
    merchResult.current = { printful: false }
    act(() => {
      useStudio.getState().resetStudio()
    })
  })

  it('без ключей показывает обе панели, четыре кадра-заглушки и четыре товара', () => {
    render(<PromoPanel />)
    expect(screen.getByTestId('promo-photo')).toBeTruthy()
    expect(screen.getByTestId('promo-merch')).toBeTruthy()
    for (const kind of ['hero', 'lifestyle', 'macro', 'package']) {
      expect(screen.getByTestId(`promo-shot-${kind}`)).toBeTruthy()
    }
    for (const id of ['tshirt', 'mug', 'poster', 'apron']) {
      expect(screen.getByTestId(`merch-item-${id}`)).toBeTruthy()
    }
  })

  it('до нажатия кнопки обе панели молчат про недостающие ключи', () => {
    render(<PromoPanel />)
    expect(screen.getByTestId('promo-note').textContent).not.toContain('GEMINI_API_KEY')
    expect(screen.getByTestId('merch-note').textContent).not.toContain('PRINTFUL_API_KEY')
  })

  it('мок-ответ про ключ Gemini появляется только после генерации', async () => {
    render(<PromoPanel />)
    fireEvent.click(screen.getByTestId('promo-generate'))
    await waitFor(() => expect(screen.getByTestId('promo-note').textContent).toContain('GEMINI_API_KEY'))
  })

  it('после настоящей серии подписи про ключ нет', async () => {
    promoResult.current = { ok: true, mock: false, images: [{ kind: 'hero', dataUrl: 'data:image/png;base64,AAAA' }] }
    render(<PromoPanel />)
    fireEvent.click(screen.getByTestId('promo-generate'))
    await waitFor(() => expect(screen.getByTestId('promo-shot-hero').querySelector('img')).toBeTruthy())
    expect(screen.getByTestId('promo-note').textContent).not.toContain('GEMINI_API_KEY')
  })

  it('без ключа Printful кнопки «Открыть в Printful» нет, а после ответа появляется подпись про ключ', async () => {
    render(<PromoPanel />)
    expect(screen.queryByTestId('merch-printful')).toBeNull()
    fireEvent.click(screen.getByTestId('merch-generate'))
    await waitFor(() => expect(screen.getByTestId('merch-note').textContent).toContain('PRINTFUL_API_KEY'))
    expect(screen.queryByTestId('merch-printful')).toBeNull()
  })

  it('ответ с ключом Printful показывает кнопку и убирает предупреждение', async () => {
    merchResult.current = { printful: true }
    render(<PromoPanel />)
    fireEvent.click(screen.getByTestId('merch-generate'))
    await waitFor(() => expect(screen.getByTestId('merch-printful')).toBeTruthy())
    expect(screen.getByTestId('merch-note').textContent).not.toContain('PRINTFUL_API_KEY')
  })

  it('настоящие кадры от Gemini заменяют заглушки картинками', async () => {
    promoResult.current = {
      ok: true,
      mock: false,
      images: [{ kind: 'hero', dataUrl: 'data:image/png;base64,AAAA' }],
    }
    render(<PromoPanel />)
    fireEvent.click(screen.getByTestId('promo-generate'))
    await waitFor(() => {
      const shot = screen.getByTestId('promo-shot-hero')
      expect(shot.querySelector('img')).toBeTruthy()
    })
    // Кадры, которых модель не отдала, остаются заглушками, а не пропадают из сетки.
    expect(screen.getByTestId('promo-shot-macro').querySelector('img')).toBeNull()
  })

  it('ошибка серии показывает алерт с текстом своего кода', async () => {
    promoResult.current = { ok: false, error: 'rateLimited' }
    render(<PromoPanel />)
    fireEvent.click(screen.getByTestId('promo-generate'))
    await waitFor(() => expect(screen.getByTestId('promo-error')).toBeTruthy())
    // Лимит и сетевой сбой это разные тексты: человек должен понять, ждать ему или чинить.
    const limited = screen.getByTestId('promo-error').textContent ?? ''
    expect(limited).not.toBe('')
    expect(limited).not.toContain('Не получилось собрать серию')
  })
})

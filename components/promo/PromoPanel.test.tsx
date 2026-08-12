import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProProvider } from '@/components/ProProvider'
import { aiAccess, type AiAccessState } from '@/lib/ai/quota'
import type { ProStatus } from '@/lib/stripe/pro'
import {
  MERCH_DEFAULT_PRODUCTS,
  PROMO_DEFAULT_SHOTS,
  PROMO_SHOT_META,
  type MerchResult,
  type PromoResult,
} from '@/lib/promo/types'
import { useStudio } from '@/lib/store/studio'
import { PromoPanel } from './PromoPanel'

const FREE_STATUS: ProStatus = { pro: false, reason: 'free', plan: null, currentPeriodEnd: null, cancelAtPeriodEnd: false }

/** Панель в окружении с известным состоянием доступа: его считает сервер в layout. */
function renderWithAccess(state: AiAccessState, used = 0) {
  return render(
    <ProProvider value={{ status: FREE_STATUS, billingEnabled: true, ai: aiAccess(state, used) }}>
      <PromoPanel />
    </ProProvider>,
  )
}

const promoResult = { current: { ok: true, mock: true, kinds: PROMO_DEFAULT_SHOTS } as PromoResult }
const merchResult = { current: { printful: false } as MerchResult }
const merchInput = vi.fn<(input: unknown) => void>()

vi.mock('@/app/actions/promo', () => ({
  generatePromoShotsAction: () => Promise.resolve(promoResult.current),
  createMerchMockupsAction: (input: unknown) => {
    merchInput(input)
    return Promise.resolve(merchResult.current)
  },
  analyzeReferenceAction: () => Promise.resolve({ ok: true, mock: true, style: DEMO_STYLE }),
  generateReferenceShotsAction: () => Promise.resolve(promoResult.current),
}))

const DEMO_STYLE = {
  lighting: 'Soft key from the left.',
  angle: 'Slightly above.',
  background: 'Warm sweep.',
  palette: 'Warm neutrals.',
  composition: 'Off centre.',
  mood: 'Calm.',
  lens: '50mm at f/2.8.',
  postProcessing: 'Warm grade.',
}

// Растеризация живёт в канвасе, которого в jsdom нет: подменяем на пустой blob.
vi.mock('@/lib/export/png', () => ({ svgToPngBlob: () => Promise.resolve(new Blob(['png'], { type: 'image/png' })) }))

describe('PromoPanel', () => {
  beforeEach(() => {
    promoResult.current = { ok: true, mock: true, kinds: PROMO_DEFAULT_SHOTS }
    merchResult.current = { printful: false }
    merchInput.mockClear()
    act(() => {
      useStudio.getState().resetStudio()
    })
  })

  it('без ключей показывает все панели, кадры-заглушки набора по умолчанию и четыре товара', () => {
    render(<PromoPanel />)
    expect(screen.getByTestId('promo-photo')).toBeTruthy()
    expect(screen.getByTestId('promo-reference')).toBeTruthy()
    expect(screen.getByTestId('promo-merch')).toBeTruthy()
    for (const kind of PROMO_DEFAULT_SHOTS) {
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
    expect(screen.getByTestId('promo-shot-macroOil').querySelector('img')).toBeNull()
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

describe('PromoPanel: гейт AI', () => {
  beforeEach(() => {
    promoResult.current = { ok: true, mock: true, kinds: PROMO_DEFAULT_SHOTS }
    merchResult.current = { printful: false }
    act(() => {
      useStudio.getState().resetStudio()
    })
  })

  it('гостю кнопки выключены и объяснено, почему, а не молча', () => {
    renderWithAccess('anonymous')
    expect(screen.getByTestId('promo-generate').hasAttribute('disabled')).toBe(true)
    expect(screen.getByTestId('merch-generate').hasAttribute('disabled')).toBe(true)
    expect(screen.getByTestId('promo-gate').textContent ?? '').not.toBe('')
    expect(screen.getByTestId('merch-gate')).toBeTruthy()
    // Гостю предлагать тарифы рано: сначала вход.
    expect(screen.queryByTestId('promo-gate-pricing')).toBeNull()
  })

  it('бесплатному аккаунту показывает ссылку на тарифы', () => {
    renderWithAccess('free')
    expect(screen.getByTestId('promo-generate').hasAttribute('disabled')).toBe(true)
    expect(screen.getByTestId('promo-gate-pricing').getAttribute('href')).toBe('/pricing')
  })

  it('подписчику кнопки открыты, а под панелью честный остаток квоты', () => {
    renderWithAccess('pro', 4)
    expect(screen.getByTestId('promo-generate').hasAttribute('disabled')).toBe(false)
    const note = screen.getByTestId('promo-gate').textContent ?? ''
    expect(note).toContain('26')
    expect(note).toContain('30')
    // Мокапы квоту не тратят, поэтому счётчик под ними не дублируется.
    expect(screen.queryByTestId('merch-gate')).toBeNull()
  })

  it('выбранная квота выключает кнопку и говорит об этом', () => {
    renderWithAccess('pro', 30)
    expect(screen.getByTestId('promo-generate').hasAttribute('disabled')).toBe(true)
    expect(screen.getByTestId('promo-gate').textContent ?? '').not.toBe('')
  })

  it('без ключей это демо-режим: замка нет и строки состояния тоже', () => {
    renderWithAccess('mock')
    expect(screen.getByTestId('promo-generate').hasAttribute('disabled')).toBe(false)
    expect(screen.queryByTestId('promo-gate')).toBeNull()
  })

  it('после генерации счётчик обновляется остатком из ответа сервера', async () => {
    promoResult.current = { ok: true, mock: false, images: [{ kind: 'hero', dataUrl: 'data:image/png;base64,AAAA' }], remaining: 17 }
    renderWithAccess('pro', 4)
    fireEvent.click(screen.getByTestId('promo-generate'))
    await waitFor(() => expect(screen.getByTestId('promo-gate').textContent ?? '').toContain('17'))
  })

  it('отказ по квоте с сервера сразу вешает замок на кнопку', async () => {
    promoResult.current = { ok: false, error: 'quota' }
    renderWithAccess('pro', 29)
    fireEvent.click(screen.getByTestId('promo-generate'))
    await waitFor(() => expect(screen.getByTestId('promo-error')).toBeTruthy())
    // Кнопка остаётся выключенной уже не из-за busy, а из-за нулевого остатка.
    expect(screen.getByTestId('promo-generate').hasAttribute('disabled')).toBe(true)
    expect(screen.getByTestId('promo-error').textContent ?? '').not.toBe('')
  })
})

describe('PromoPanel: выбор пресетов', () => {
  beforeEach(() => {
    promoResult.current = { ok: true, mock: true, kinds: PROMO_DEFAULT_SHOTS }
    merchResult.current = { printful: false }
    act(() => {
      useStudio.getState().resetStudio()
    })
  })

  it('все двенадцать пресетов доступны к выбору, а в сетке только отмеченные', () => {
    render(<PromoPanel />)
    for (const meta of PROMO_SHOT_META) {
      expect(screen.getByTestId(`promo-preset-${meta.kind}`)).toBeTruthy()
    }
    // Двенадцать чипов, но в галерее четыре кадра: остальные не заказаны и не нарисованы.
    expect(screen.queryByTestId('promo-shot-catalog')).toBeNull()
    expect(screen.getByTestId('promo-shot-hero')).toBeTruthy()
  })

  it('цена в единицах квоты показана до нажатия и меняется вместе с набором', () => {
    render(<PromoPanel />)
    const cost = () => screen.getByTestId('promo-cost').textContent ?? ''
    expect(cost()).toContain('4')
    fireEvent.click(screen.getByTestId('promo-preset-catalog'))
    expect(cost()).toContain('5')
    expect(screen.getByTestId('promo-shot-catalog')).toBeTruthy()
  })

  it('снятый пресет уходит из сетки, а пустой набор выключает кнопку', () => {
    render(<PromoPanel />)
    for (const kind of PROMO_DEFAULT_SHOTS) {
      fireEvent.click(screen.getByTestId(`promo-preset-${kind}`))
    }
    expect(screen.queryByTestId('promo-shot-hero')).toBeNull()
    expect(screen.getByTestId('promo-generate').hasAttribute('disabled')).toBe(true)
    // Молча неработающая кнопка хуже объяснения.
    expect(screen.getByTestId('promo-cost').textContent ?? '').not.toBe('')
  })

  it('состояние чипа доступно скринридеру, а не только цветом', () => {
    render(<PromoPanel />)
    expect(screen.getByTestId('promo-preset-hero').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('promo-preset-catalog').getAttribute('aria-pressed')).toBe('false')
  })
})

describe('PromoPanel: генерация по референсу', () => {
  const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ'

  /** Файл с подменённым результатом FileReader: в jsdom он читает пустоту. */
  function pickFile(type = 'image/jpeg', size = 1000): void {
    const file = new File(['x'], 'ref.jpg', { type })
    Object.defineProperty(file, 'size', { value: size })
    fireEvent.change(screen.getByTestId('ref-file'), { target: { files: [file] } })
  }

  beforeEach(() => {
    promoResult.current = { ok: true, mock: true, kinds: PROMO_DEFAULT_SHOTS }
    merchResult.current = { printful: false }
    act(() => {
      useStudio.getState().resetStudio()
    })
    // FileReader в jsdom вернёт пустую строку: подменяем на настоящий data-url.
    vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function (this: FileReader) {
      Object.defineProperty(this, 'result', { value: JPEG, configurable: true })
      this.onload?.(new ProgressEvent('load') as ProgressEvent<FileReader>)
    })
  })

  it('оговорка про референс видна сразу, а не после генерации', () => {
    render(<PromoPanel />)
    const text = screen.getByTestId('ref-disclaimer').textContent ?? ''
    expect(text).not.toBe('')
    expect(text.toLowerCase()).toContain('не копируется')
  })

  it('до выбора файла разбирать нечего и кнопка выключена', () => {
    render(<PromoPanel />)
    expect(screen.getByTestId('ref-analyze').hasAttribute('disabled')).toBe(true)
    expect(screen.queryByTestId('ref-preview')).toBeNull()
    expect(screen.queryByTestId('ref-style')).toBeNull()
  })

  it('чужой формат отбивается на клиенте внятной строкой, без похода на сервер', () => {
    render(<PromoPanel />)
    pickFile('image/svg+xml')
    expect(screen.getByTestId('ref-error').textContent ?? '').not.toBe('')
    expect(screen.queryByTestId('ref-preview')).toBeNull()
  })

  it('слишком тяжёлый файл тоже отбивается до загрузки', () => {
    render(<PromoPanel />)
    pickFile('image/jpeg', 9 * 1024 * 1024)
    expect(screen.getByTestId('ref-error').textContent ?? '').not.toBe('')
    expect(screen.queryByTestId('ref-preview')).toBeNull()
  })

  it('разбор показывается человеку до генерации и правится руками', async () => {
    render(<PromoPanel />)
    pickFile()
    await waitFor(() => expect(screen.getByTestId('ref-preview')).toBeTruthy())
    fireEvent.click(screen.getByTestId('ref-analyze'))
    await waitFor(() => expect(screen.getByTestId('ref-style')).toBeTruthy())

    const lighting = screen.getByTestId('ref-style-lighting') as HTMLTextAreaElement
    expect(lighting.value).toContain('Soft key')
    fireEvent.change(lighting, { target: { value: 'Hard light from above.' } })
    expect((screen.getByTestId('ref-style-lighting') as HTMLTextAreaElement).value).toBe('Hard light from above.')
  })

  it('цена серии по референсу выше кадра из пресета и растёт с числом кадров', async () => {
    render(<PromoPanel />)
    pickFile()
    await waitFor(() => expect(screen.getByTestId('ref-preview')).toBeTruthy())
    fireEvent.click(screen.getByTestId('ref-analyze'))
    await waitFor(() => expect(screen.getByTestId('ref-cost')).toBeTruthy())
    // Два кадра по референсу стоят четыре единицы: пресетный кадр стоит одну.
    expect(screen.getByTestId('ref-cost').textContent ?? '').toContain('4')
    fireEvent.click(screen.getByTestId('ref-count-4'))
    expect(screen.getByTestId('ref-cost').textContent ?? '').toContain('8')
  })
})

describe('PromoPanel: мокапы Printful', () => {
  beforeEach(() => {
    promoResult.current = { ok: true, mock: true, kinds: PROMO_DEFAULT_SHOTS }
    merchResult.current = { printful: false }
    merchInput.mockClear()
    act(() => {
      useStudio.getState().resetStudio()
    })
  })

  it('на сервер уезжает рендер доски и список отмеченных товаров', async () => {
    render(<PromoPanel />)
    fireEvent.click(screen.getByTestId('merch-generate'))
    await waitFor(() => expect(merchInput).toHaveBeenCalled())
    const input = merchInput.mock.calls[0]?.[0] as { boardPng?: string; products?: string[] }
    expect(typeof input.boardPng).toBe('string')
    expect(input.products).toEqual([...MERCH_DEFAULT_PRODUCTS])
  })

  it('по умолчанию отмечено два товара: Printful пускает пару мокапов в минуту', () => {
    render(<PromoPanel />)
    expect(MERCH_DEFAULT_PRODUCTS).toHaveLength(2)
    expect(screen.getByTestId('merch-pick-tshirt').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('merch-pick-poster').getAttribute('aria-pressed')).toBe('false')
  })

  it('снятые товары выключают кнопку и объясняют почему', () => {
    render(<PromoPanel />)
    for (const id of MERCH_DEFAULT_PRODUCTS) fireEvent.click(screen.getByTestId(`merch-pick-${id}`))
    expect(screen.getByTestId('merch-generate').hasAttribute('disabled')).toBe(true)
    expect(screen.getByTestId('merch-picks-note').textContent ?? '').not.toBe('')
  })

  it('добавленный товар уезжает в запрос вместе с остальными', async () => {
    render(<PromoPanel />)
    fireEvent.click(screen.getByTestId('merch-pick-poster'))
    fireEvent.click(screen.getByTestId('merch-generate'))
    await waitFor(() => expect(merchInput).toHaveBeenCalled())
    const input = merchInput.mock.calls[0]?.[0] as { products?: string[] }
    expect(input.products).toContain('poster')
  })

  it('пришедшие мокапы заменяют локальную компоновку картинками со ссылкой', async () => {
    merchResult.current = {
      printful: true,
      mockups: [
        { id: 'tshirt', url: 'https://printful.example/t.jpg' },
        { id: 'mug', url: 'https://printful.example/m.jpg' },
      ],
    }
    render(<PromoPanel />)
    fireEvent.click(screen.getByTestId('merch-generate'))
    await waitFor(() => expect(screen.getByTestId('merch-item-tshirt').querySelector('img')).toBeTruthy())
    expect(screen.getByTestId('merch-link-tshirt').getAttribute('href')).toBe('https://printful.example/t.jpg')
    // Товары, которых Printful не отдал, остаются локальной компоновкой, а не пропадают.
    expect(screen.getByTestId('merch-item-poster').querySelector('img')).toBeNull()
    expect(screen.getByTestId('merch-item-poster').querySelector('svg')).toBeTruthy()
  })

  it('сбой Printful объясняется своей строкой и не выносит галерею', async () => {
    merchResult.current = { printful: true, error: 'rejected' }
    render(<PromoPanel />)
    fireEvent.click(screen.getByTestId('merch-generate'))
    await waitFor(() => expect(screen.getByTestId('merch-error')).toBeTruthy())
    const text = screen.getByTestId('merch-error').textContent ?? ''
    expect(text).not.toBe('')
    // Отбитый макет и общий сбой это разные советы человеку.
    expect(text).not.toContain('Не получилось собрать мокапы')
    expect(screen.getByTestId('merch-item-tshirt').querySelector('svg')).toBeTruthy()
  })

  it('ненастроенный Printful не считается ошибкой: это подпись, а не алерт', async () => {
    merchResult.current = { printful: true, error: 'notConfigured' }
    render(<PromoPanel />)
    fireEvent.click(screen.getByTestId('merch-generate'))
    await waitFor(() => expect(screen.getByTestId('merch-note')).toBeTruthy())
    expect(screen.queryByTestId('merch-error')).toBeNull()
  })
})

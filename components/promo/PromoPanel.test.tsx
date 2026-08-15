import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProProvider } from '@/components/ProProvider'
import { SessionProvider } from '@/components/SessionProvider'
import { AI_MONTHLY_LIMIT, FREE_TRIAL_LIMIT, aiAccess, type AiAccessState } from '@/lib/ai/quota'
import type { ProStatus } from '@/lib/stripe/pro'
import { MERCH_DEFAULT_PRODUCTS, PROMO_DEFAULT_SHOTS, PROMO_SHOT_META, type MerchResult } from '@/lib/promo/types'
import { useStudio } from '@/lib/store/studio'
import { PromoPanel } from './PromoPanel'

const FREE_STATUS: ProStatus = { pro: false, reason: 'free', plan: null, currentPeriodEnd: null, cancelAtPeriodEnd: false }

/**
 * Панель в окружении с известным состоянием доступа: его считает сервер в layout.
 * Состояния кроме 'mock'/'anonymous' подразумевают вошедшего человека - сессия
 * приезжает тем же пропсом, что и в проде (SessionProvider из корневого layout).
 */
function renderWithAccess(state: AiAccessState, used = 0, limit: number = AI_MONTHLY_LIMIT) {
  const user = state === 'anonymous' || state === 'mock' ? null : { id: 'user-1', email: 'a@b.co' }
  return render(
    <SessionProvider value={{ user, enabled: true }}>
      <ProProvider value={{ status: FREE_STATUS, billingEnabled: true, ai: aiAccess(state, used, limit) }}>
        <PromoPanel />
      </ProProvider>
    </SessionProvider>,
  )
}

const merchResult = { current: { printful: false } as MerchResult }
const merchInput = vi.fn<(input: unknown) => void>()
const createSeriesInput = vi.fn<(input: unknown) => void>()

interface CreateSeriesInput {
  readonly shots?: readonly { kind: string }[]
}
type CreateSeriesResult = { readonly ok: true; readonly data: unknown } | { readonly ok: false; readonly error: string }

/**
 * Ответ createPromoSeriesAction по умолчанию: одна серия, кадры сразу queued.
 * Тесты, которым нужен другой исход (ошибка, конкретные кадры), переопределяют
 * createSeriesResult.current перед рендером.
 */
const createSeriesResult: { current: (input: CreateSeriesInput) => CreateSeriesResult } = {
  current: (input) => ({
    ok: true,
    data: {
      seriesId: 'series-1',
      shots: (input.shots ?? []).map((s, i) => ({
        id: `shot-${i}`,
        seriesId: 'series-1',
        kindSlug: s.kind,
        ordinal: i,
        status: 'queued' as const,
        parentShotId: null,
        variantNo: 1,
        editPrompt: null,
        url: null,
        width: null,
        height: null,
        provider: null,
        prompt: null,
        error: null,
        retries: 0,
      })),
    },
  }),
}

// ensureSaved() (useProjectGuard) должен успешно "сохранить" проект без похода
// в Supabase, которого в юнит-тестах нет: иначе клик по генерации у вошедшего
// человека всегда падал бы в guard.state === 'failed' раньше, чем дойти до
// createPromoSeriesAction.
vi.mock('@/app/actions/projects', () => ({
  upsertProjectAction: () => Promise.resolve({ ok: true, data: { id: 'project-1', name: 'board', updatedAt: '2026-01-01' } }),
}))

vi.mock('@/app/actions/promo', () => ({
  createPromoSeriesAction: (input: { shots?: readonly { kind: string }[] }) => {
    createSeriesInput(input)
    return Promise.resolve(createSeriesResult.current(input))
  },
  cancelPromoSeriesAction: () => Promise.resolve({ ok: false, error: 'invalid' }),
  retryPromoShotAction: () => Promise.resolve({ ok: false, error: 'invalid' }),
  createMerchMockupsAction: (input: unknown) => {
    merchInput(input)
    return Promise.resolve(merchResult.current)
  },
  analyzeReferenceAction: () => Promise.resolve({ ok: true, mock: true, style: DEMO_STYLE }),
  // Гидратация серий при монтировании панели: в этом тесте она не проверяется,
  // но без заглушек эффект падает на отсутствующем экспорте мока.
  listActiveSeriesAction: () => Promise.resolve({ ok: true, data: { series: [], shots: [] } }),
  listPromoSeriesAction: () => Promise.resolve({ ok: true, data: { series: [], shots: [] } }),
  editPromoShotAction: () => Promise.resolve({ ok: false, error: 'invalid' }),
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
    merchResult.current = { printful: false }
    merchInput.mockClear()
    createSeriesInput.mockClear()
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

  it('до нажатия кнопки мерч молчит про недостающий ключ', () => {
    render(<PromoPanel />)
    expect(screen.getByTestId('merch-note').textContent).not.toContain('PRINTFUL_API_KEY')
  })

  it('без ключей (демо-режим) генерация проходит локально: очередь доезжает до "готово" без единого запроса', async () => {
    render(<PromoPanel />)
    fireEvent.click(screen.getByTestId('promo-generate'))
    await waitFor(() => expect(screen.getByTestId('promo-series-progress').textContent ?? '').toContain('4'))
    // Демо-режим не ходит на сервер вовсе: карточки остаются заглушками узора, а не пустеют.
    expect(createSeriesInput).not.toHaveBeenCalled()
    for (const kind of PROMO_DEFAULT_SHOTS) {
      expect(screen.getByTestId(`promo-shot-${kind}`).querySelector('svg')).toBeTruthy()
    }
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

  it('вошедший Pro: генерация заводит серию через createPromoSeriesAction с отмеченными пресетами', async () => {
    renderWithAccess('pro', 4)
    fireEvent.click(screen.getByTestId('promo-generate'))
    await waitFor(() => expect(createSeriesInput).toHaveBeenCalled())
    const input = createSeriesInput.mock.calls[0]?.[0] as { source: string; shots: readonly { kind: string }[] }
    expect(input.source).toBe('presets')
    expect(input.shots.map((s) => s.kind)).toEqual([...PROMO_DEFAULT_SHOTS])
    await waitFor(() => expect(screen.getByTestId('promo-series-progress')).toBeTruthy())
  })

  it('ошибка серии показывает алерт с текстом своего кода', async () => {
    createSeriesResult.current = () => ({ ok: false, error: 'rateLimited' })
    renderWithAccess('pro', 4)
    fireEvent.click(screen.getByTestId('promo-generate'))
    await waitFor(() => expect(screen.getByTestId('promo-error')).toBeTruthy())
    const limited = screen.getByTestId('promo-error').textContent ?? ''
    expect(limited).not.toBe('')
    expect(limited).not.toContain('Не получилось собрать серию')
  })
})

describe('PromoPanel: гейт AI', () => {
  beforeEach(() => {
    merchResult.current = { printful: false }
    createSeriesInput.mockClear()
    createSeriesResult.current = (input) => ({
      ok: true,
      data: {
        seriesId: 'series-1',
        shots: (input.shots ?? []).map((s, i) => ({
          id: `shot-${i}`,
          seriesId: 'series-1',
          kindSlug: s.kind,
          ordinal: i,
          status: 'queued' as const,
          parentShotId: null,
          variantNo: 1,
          editPrompt: null,
          url: null,
          width: null,
          height: null,
          provider: null,
          prompt: null,
          error: null,
          retries: 0,
        })),
      },
    })
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

  it('отказ по квоте с сервера показывает алерт', async () => {
    createSeriesResult.current = () => ({ ok: false, error: 'quota' })
    renderWithAccess('pro', 29)
    fireEvent.click(screen.getByTestId('promo-generate'))
    await waitFor(() => expect(screen.getByTestId('promo-error')).toBeTruthy())
    expect(screen.getByTestId('promo-error').textContent ?? '').not.toBe('')
  })
})

describe('PromoPanel: выбор пресетов', () => {
  beforeEach(() => {
    merchResult.current = { printful: false }
    createSeriesInput.mockClear()
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

describe('PromoPanel: выбор пресетов в пробном тире', () => {
  beforeEach(() => {
    merchResult.current = { printful: false }
    createSeriesInput.mockClear()
    act(() => {
      useStudio.getState().resetStudio()
    })
  })

  // Сценарий из прод-теста: остаток три, а по умолчанию отмечены четыре пресета
  // (PROMO_DEFAULT_SHOTS). Сервер всё равно режет серию до одного кадра, поэтому
  // и стартовый выбор в интерфейсе обязан быть таким же, а не врать про четыре.
  it('стартовый выбор во free-тире это один кадр, а не все четыре дефолтных', () => {
    renderWithAccess('trial', 0, FREE_TRIAL_LIMIT)
    expect(screen.getByTestId('promo-shot-hero')).toBeTruthy()
    expect(screen.queryByTestId('promo-shot-serving')).toBeNull()
    expect(screen.queryByTestId('promo-shot-macroOil')).toBeNull()
    expect(screen.queryByTestId('promo-shot-package')).toBeNull()
    // Счётчик под чипами обязан обещать ровно то, что спишется.
    expect(screen.getByTestId('promo-cost').textContent ?? '').toContain('1')
  })

  it('остальные чипы недоступны, пока один уже отмечен', () => {
    renderWithAccess('trial', 0, FREE_TRIAL_LIMIT)
    expect(screen.getByTestId('promo-preset-serving').hasAttribute('disabled')).toBe(true)
  })

  it('генерация во free-тире шлёт ровно один кадр из выбранных', async () => {
    renderWithAccess('trial', 0, FREE_TRIAL_LIMIT)
    fireEvent.click(screen.getByTestId('promo-generate'))
    await waitFor(() => expect(createSeriesInput).toHaveBeenCalled())
    const input = createSeriesInput.mock.calls[0]?.[0] as { shots?: readonly { kind: string }[] }
    expect(input.shots).toHaveLength(1)
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
    merchResult.current = { printful: false }
    createSeriesInput.mockClear()
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
    merchResult.current = { printful: false }
    merchInput.mockClear()
    createSeriesInput.mockClear()
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

  it('ненастроенный магазин Printful честно показан человеку, а не спрятан за пустой подписью', async () => {
    merchResult.current = { printful: true, error: 'notConfigured' }
    render(<PromoPanel />)
    fireEvent.click(screen.getByTestId('merch-generate'))
    await waitFor(() => expect(screen.getByTestId('merch-error')).toBeTruthy())
    const text = screen.getByTestId('merch-error').textContent ?? ''
    expect(text).not.toBe('')
    // Технический текст про переменную окружения владельцу здесь не место.
    expect(text).not.toContain('PRINTFUL_STORE_ID')
    // Компоновка остаётся на экране, вкладка не пустеет из-за чужого сбоя.
    expect(screen.getByTestId('merch-item-tshirt').querySelector('svg')).toBeTruthy()
  })

  it('отказ сервера по гейту показан прямо в панели, а не молча', async () => {
    // Кнопка открыта (Pro), но сервер на этот конкретный клик всё равно отказал -
    // рассинхрон состояния (сессия истекла, квота выбрана параллельным вызовом).
    // Раньше в этом случае панель молча показывала merch.idle, будто ничего не было.
    merchResult.current = { printful: false, denied: 'quota' }
    renderWithAccess('pro', 4)
    expect(screen.getByTestId('merch-generate').hasAttribute('disabled')).toBe(false)
    fireEvent.click(screen.getByTestId('merch-generate'))
    await waitFor(() => expect(screen.getByTestId('merch-gate-note')).toBeTruthy())
    expect(screen.getByTestId('merch-gate-note').textContent ?? '').not.toBe('')
  })

  it('в пробном тире кнопка мерча заперта заранее: мокапы не входят в trial', () => {
    renderWithAccess('trial', 0, FREE_TRIAL_LIMIT)
    expect(screen.getByTestId('merch-generate').hasAttribute('disabled')).toBe(true)
    expect(screen.getByTestId('merch-gate')).toBeTruthy()
    expect(screen.getByTestId('merch-gate').textContent ?? '').not.toBe('')
    // Соседняя панель кадров, наоборот, остаётся открытой: promoShots в trial входит.
    expect(screen.getByTestId('promo-generate').hasAttribute('disabled')).toBe(false)
  })
})

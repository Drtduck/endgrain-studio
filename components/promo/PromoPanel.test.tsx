import type { ReactNode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProProvider } from '@/components/ProProvider'
import { SessionProvider } from '@/components/SessionProvider'
import { AI_MONTHLY_LIMIT, FREE_TRIAL_LIMIT, aiAccess, type AiAccess, type AiAccessState } from '@/lib/ai/quota'
import { useAiAccessStore } from '@/lib/store/aiAccess'
import type { ProStatus } from '@/lib/stripe/pro'
import { MERCH_DEFAULT_PRODUCTS, PROMO_DEFAULT_SHOTS, PROMO_SHOT_META, type MerchResult } from '@/lib/promo/types'
import { usePromoStore } from '@/lib/store/promo'
import { useStudio } from '@/lib/store/studio'
import { MerchMockups } from './MerchMockups'
import { PromoPanel } from './PromoPanel'

const FREE_STATUS: ProStatus = { pro: false, reason: 'free', plan: null, currentPeriodEnd: null, cancelAtPeriodEnd: false }

/**
 * Произвольный узел в окружении с известным состоянием доступа: его считает
 * сервер в layout. Состояния кроме 'mock'/'anonymous' подразумевают вошедшего
 * человека - сессия приезжает тем же пропсом, что и в проде (SessionProvider
 * из корневого layout).
 */
function renderNodeWithAccess(node: ReactNode, state: AiAccessState, used = 0, limit: number = AI_MONTHLY_LIMIT, credits = 0) {
  const user = state === 'anonymous' || state === 'mock' ? null : { id: 'user-1', email: 'a@b.co' }
  return render(
    <SessionProvider value={{ user, enabled: true }}>
      <ProProvider value={{ status: FREE_STATUS, billingEnabled: true, ai: aiAccess(state, used, limit, credits) }}>
        {node}
      </ProProvider>
    </SessionProvider>,
  )
}

/** Панель промо-кадров в окружении с известным состоянием доступа. */
function renderWithAccess(state: AiAccessState, used = 0, limit: number = AI_MONTHLY_LIMIT, credits = 0) {
  return renderNodeWithAccess(<PromoPanel />, state, used, limit, credits)
}

const merchResult = { current: { printful: false } as MerchResult }
const merchInput = vi.fn<(input: unknown) => void>()
const createSeriesInput = vi.fn<(input: unknown) => void>()

/**
 * Гидратация уже существующих на сервере серий/кадров при монтировании
 * панели (P0-блокер приёмки 15.08.2026): по умолчанию пусто, тесты про
 * «кадры пропадают после F5» переопределяют .current перед рендером.
 */
const listActiveSeriesResult: { current: { ok: true; data: { series: unknown[]; shots: unknown[] } } } = {
  current: { ok: true, data: { series: [], shots: [] } },
}
const listPromoSeriesResult: { current: { ok: true; data: { series: unknown[]; shots: unknown[] } } } = {
  current: { ok: true, data: { series: [], shots: [] } },
}
const listPromoSeriesInput = vi.fn<(projectId: string) => void>()

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
  // Гидратация серий при монтировании панели: по умолчанию пусто (большинство тестов
  // её не проверяет), но некоторые тесты (P0-блокер приёмки 15.08.2026, «кадры пропадают
  // после F5») переопределяют .current, чтобы проверить подъём уже готовой серии.
  listActiveSeriesAction: () => Promise.resolve(listActiveSeriesResult.current),
  listPromoSeriesAction: (projectId: string) => {
    listPromoSeriesInput(projectId)
    return Promise.resolve(listPromoSeriesResult.current)
  },
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

/**
 * Свежий остаток кадров, который панель перечитывает после списания (баг ручной
 * приёмки 15.08.2026). По умолчанию 'mock': стор такое состояние игнорирует, и
 * все остальные тесты видят ровно тот доступ, что задан через ProProvider.
 */
const readAiAccessResult: { current: AiAccess } = { current: aiAccess('mock') }
vi.mock('@/app/actions/credits', () => ({
  readAiAccessAction: () => Promise.resolve(readAiAccessResult.current),
}))

// Выбор пресетов живёт в общем сторе (lib/store/promo.ts) и намеренно переживает
// размонтирование панели - значит, переживает и переход между тестами: без сброса
// следующий кейс видел бы кадры, отмеченные предыдущим. Перечитанный остаток
// кадров (lib/store/aiAccess.ts) живёт там же и сбрасывается по той же причине.
beforeEach(() => {
  usePromoStore.setState({ selectedKinds: null })
  useAiAccessStore.setState({ access: null })
  readAiAccessResult.current = aiAccess('mock')
})

describe('PromoPanel', () => {
  beforeEach(() => {
    merchResult.current = { printful: false }
    merchInput.mockClear()
    createSeriesInput.mockClear()
    act(() => {
      useStudio.getState().resetStudio()
    })
  })

  it('без ключей показывает все панели, кадры-заглушки набора по умолчанию', () => {
    render(<PromoPanel />)
    expect(screen.getByTestId('promo-photo')).toBeTruthy()
    expect(screen.getByTestId('promo-reference')).toBeTruthy()
    // Мерч спрятан до готовности флоу покупки (спека merch-orders.md, PR #47):
    // старая кнопка вела в чужой кабинет Printful, новая касса ещё не смержена.
    expect(screen.queryByTestId('promo-merch')).toBeNull()
    for (const kind of PROMO_DEFAULT_SHOTS) {
      expect(screen.getByTestId(`promo-shot-${kind}`)).toBeTruthy()
    }
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
})

/**
 * Компонент мерча скрыт из вкладки «Промо» до готовности кассы (PR #47), но
 * сам код остаётся рабочим и вернётся в панель без переписывания: тесты его
 * поведения рендерят MerchMockups напрямую, минуя PromoPanel.
 */
describe('MerchMockups', () => {
  beforeEach(() => {
    merchResult.current = { printful: false }
    merchInput.mockClear()
    act(() => {
      useStudio.getState().resetStudio()
    })
  })

  it('показывает четыре товара', () => {
    render(<MerchMockups />)
    for (const id of ['tshirt', 'mug', 'poster', 'apron']) {
      expect(screen.getByTestId(`merch-item-${id}`)).toBeTruthy()
    }
  })

  it('до нажатия кнопки мерч молчит про недостающий ключ', () => {
    render(<MerchMockups />)
    expect(screen.getByTestId('merch-note').textContent).not.toContain('PRINTFUL_API_KEY')
  })

  it('без ключа Printful кнопки «Открыть в Printful» нет, а после ответа появляется подпись про ключ', async () => {
    render(<MerchMockups />)
    expect(screen.queryByTestId('merch-printful')).toBeNull()
    fireEvent.click(screen.getByTestId('merch-generate'))
    await waitFor(() => expect(screen.getByTestId('merch-note').textContent).toContain('PRINTFUL_API_KEY'))
    expect(screen.queryByTestId('merch-printful')).toBeNull()
  })

  it('ответ с ключом Printful показывает кнопку и убирает предупреждение', async () => {
    merchResult.current = { printful: true }
    render(<MerchMockups />)
    fireEvent.click(screen.getByTestId('merch-generate'))
    await waitFor(() => expect(screen.getByTestId('merch-printful')).toBeTruthy())
    expect(screen.getByTestId('merch-note').textContent).not.toContain('PRINTFUL_API_KEY')
  })
})

describe('PromoPanel: генерация серии', () => {
  beforeEach(() => {
    createSeriesInput.mockClear()
    act(() => {
      useStudio.getState().resetStudio()
    })
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
    expect(screen.getByTestId('promo-gate').textContent ?? '').not.toBe('')
    // Гостю предлагать тарифы рано: сначала вход.
    expect(screen.queryByTestId('promo-gate-pricing')).toBeNull()

    renderNodeWithAccess(<MerchMockups />, 'anonymous')
    expect(screen.getByTestId('merch-generate').hasAttribute('disabled')).toBe(true)
    expect(screen.getByTestId('merch-gate')).toBeTruthy()
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
  })

  it('мокапы квоту не тратят, поэтому у подписчика счётчик под ними не дублируется', () => {
    renderNodeWithAccess(<MerchMockups />, 'pro', 4)
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

  /**
   * P0-блокер приёмки 15.08.2026: Free с купленными кадрами видел «Осталось 13
   * из 3 пробных генераций» и «Спишется 1 из месячной квоты», хотя ни пробного
   * лимита 3, ни месячной квоты у аккаунта нет вовсе.
   */
  it('trial с купленными кадрами: счётчик честный, а не "N из 3 пробных"', () => {
    renderWithAccess('trial', 0, FREE_TRIAL_LIMIT, 10)
    const note = screen.getByTestId('promo-trial-note').textContent ?? ''
    expect(note).not.toContain('из 3 пробных')
    expect(note).toContain('10')
  })

  /**
   * Правка UX-приёмки 15.08.2026: формулировка списания обязана называть
   * ФАКТИЧЕСКИЙ источник, а не сам факт наличия купленных кадров на балансе.
   * Пробное ещё не тронуто (used=0, лимит 3), значит один кадр этого клика
   * спишется из пробного, а десять купленных на балансе лежат нетронутыми -
   * строка обязана говорить "пробных", а не "купленных".
   */
  it('trial не исчерпан, но на балансе есть купленные: строка списания говорит про пробные, а не про купленные', () => {
    renderWithAccess('trial', 0, FREE_TRIAL_LIMIT, 10)
    const cost = screen.getByTestId('promo-cost').textContent ?? ''
    expect(cost).not.toContain('месячной квоты')
    expect(cost).not.toContain('купленных')
    expect(cost).toContain('пробных')
  })

  it('trial исчерпан, платит купленными: строка списания честно говорит про купленные кадры', () => {
    renderWithAccess('trial', FREE_TRIAL_LIMIT, FREE_TRIAL_LIMIT, 10)
    const cost = screen.getByTestId('promo-cost').textContent ?? ''
    expect(cost).not.toContain('месячной квоты')
    expect(cost).not.toContain('пробных')
    expect(cost).toContain('купленных')
  })

  it('чистый Pro без купленных кадров: строка списания по-прежнему про месячную квоту', () => {
    renderWithAccess('pro', 4)
    const cost = screen.getByTestId('promo-cost').textContent ?? ''
    expect(cost).toContain('месячной квоты')
  })

  /**
   * Месячная квота почти выбрана (28 из 30, остаток 2), а выбор по умолчанию -
   * четыре кадра: два спишутся из квоты, два - из купленных. Строка обязана
   * назвать оба источника, а не соврать про один из них.
   */
  it('квота почти исчерпана и есть купленные: строка списания называет оба источника', () => {
    renderWithAccess('pro', 28, AI_MONTHLY_LIMIT, 5)
    const cost = screen.getByTestId('promo-cost').textContent ?? ''
    expect(cost).toContain('2')
    expect(cost).toContain('бесплатных')
    expect(cost).toContain('купленных')
  })

  /**
   * Правка UX-приёмки 15.08.2026: у нового (несохранённого) проекта плашка
   * статуса вечно висела на "Сохраняем проект…", хотя ensureSaved() ещё ни разу
   * не вызывался и ни один запрос не летел. Проект реально сохраняется только
   * при первой генерации, до этого честное состояние - нейтральное "ещё не
   * сохранён", а не подделка под идущий запрос.
   */
  it('несохранённый проект: плашка честно говорит "ещё не сохранён", а не "Сохраняем…"', () => {
    renderWithAccess('pro', 4)
    const plaque = screen.getByTestId('promo-project-plaque').textContent ?? ''
    expect(plaque).not.toContain('Сохраняем')
    expect(plaque).toContain('не сохранён')
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

describe('MerchMockups: мокапы Printful', () => {
  beforeEach(() => {
    merchResult.current = { printful: false }
    merchInput.mockClear()
    createSeriesInput.mockClear()
    act(() => {
      useStudio.getState().resetStudio()
    })
  })

  it('на сервер уезжает рендер доски и список отмеченных товаров', async () => {
    render(<MerchMockups />)
    fireEvent.click(screen.getByTestId('merch-generate'))
    await waitFor(() => expect(merchInput).toHaveBeenCalled())
    const input = merchInput.mock.calls[0]?.[0] as { boardPng?: string; products?: string[] }
    expect(typeof input.boardPng).toBe('string')
    expect(input.products).toEqual([...MERCH_DEFAULT_PRODUCTS])
  })

  it('по умолчанию отмечено два товара: Printful пускает пару мокапов в минуту', () => {
    render(<MerchMockups />)
    expect(MERCH_DEFAULT_PRODUCTS).toHaveLength(2)
    expect(screen.getByTestId('merch-pick-tshirt').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('merch-pick-poster').getAttribute('aria-pressed')).toBe('false')
  })

  it('снятые товары выключают кнопку и объясняют почему', () => {
    render(<MerchMockups />)
    for (const id of MERCH_DEFAULT_PRODUCTS) fireEvent.click(screen.getByTestId(`merch-pick-${id}`))
    expect(screen.getByTestId('merch-generate').hasAttribute('disabled')).toBe(true)
    expect(screen.getByTestId('merch-picks-note').textContent ?? '').not.toBe('')
  })

  it('добавленный товар уезжает в запрос вместе с остальными', async () => {
    render(<MerchMockups />)
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
    render(<MerchMockups />)
    fireEvent.click(screen.getByTestId('merch-generate'))
    await waitFor(() => expect(screen.getByTestId('merch-item-tshirt').querySelector('img')).toBeTruthy())
    expect(screen.getByTestId('merch-link-tshirt').getAttribute('href')).toBe('https://printful.example/t.jpg')
    // Товары, которых Printful не отдал, остаются локальной компоновкой, а не пропадают.
    expect(screen.getByTestId('merch-item-poster').querySelector('img')).toBeNull()
    expect(screen.getByTestId('merch-item-poster').querySelector('svg')).toBeTruthy()
  })

  it('сбой Printful объясняется своей строкой и не выносит галерею', async () => {
    merchResult.current = { printful: true, error: 'rejected' }
    render(<MerchMockups />)
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
    render(<MerchMockups />)
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
    renderNodeWithAccess(<MerchMockups />, 'pro', 4)
    expect(screen.getByTestId('merch-generate').hasAttribute('disabled')).toBe(false)
    fireEvent.click(screen.getByTestId('merch-generate'))
    await waitFor(() => expect(screen.getByTestId('merch-gate-note')).toBeTruthy())
    expect(screen.getByTestId('merch-gate-note').textContent ?? '').not.toBe('')
  })

  it('в пробном тире кнопка мерча заперта заранее: мокапы не входят в trial', () => {
    renderNodeWithAccess(<MerchMockups />, 'trial', 0, FREE_TRIAL_LIMIT)
    expect(screen.getByTestId('merch-generate').hasAttribute('disabled')).toBe(true)
    expect(screen.getByTestId('merch-gate')).toBeTruthy()
    expect(screen.getByTestId('merch-gate').textContent ?? '').not.toBe('')
  })

  it('соседняя панель кадров остаётся открытой в пробном тире: promoShots в trial входит', () => {
    renderWithAccess('trial', 0, FREE_TRIAL_LIMIT)
    expect(screen.getByTestId('promo-generate').hasAttribute('disabled')).toBe(false)
  })
})

/**
 * P0-блокер приёмки 15.08.2026 («кадры пропадают из виду после F5»): у чистого
 * localStorage документ endgrain.current.v1 не пишется, пока не тронешь редактор,
 * но проект и честно нарисованные кадры уже есть в облаке. currentProjectId в
 * сторе гидрируется независимо от локального документа (lib/store/persist.ts),
 * а PhotoSeries обязан подхватить уже существующую серию по этому projectId,
 * даже если ни один локальный документ не восстанавливался в этом тесте вообще.
 */
describe('PromoPanel: подъём существующей серии без локального документа (P0-блокер приёмки 15.08.2026)', () => {
  const DONE_SHOT = {
    id: 'shot-hero-1',
    seriesId: 'series-existing',
    kindSlug: 'hero',
    ordinal: 0,
    status: 'done' as const,
    parentShotId: null,
    variantNo: 1,
    editPrompt: null,
    url: 'https://storage.example/hero.png',
    width: 1024,
    height: 1024,
    provider: 'fal',
    prompt: 'a board',
    error: null,
    retries: 0,
  }
  const EXISTING_SERIES = {
    id: 'series-existing',
    projectId: 'project-restored',
    source: 'presets' as const,
    status: 'done' as const,
    requested: 1,
    succeeded: 1,
    failed: 0,
    createdAt: '2026-08-01T00:00:00.000Z',
    finishedAt: '2026-08-01T00:01:00.000Z',
  }

  beforeEach(() => {
    listActiveSeriesResult.current = { ok: true, data: { series: [], shots: [] } }
    listPromoSeriesResult.current = { ok: true, data: { series: [EXISTING_SERIES], shots: [DONE_SHOT] } }
    listPromoSeriesInput.mockClear()
    act(() => {
      useStudio.getState().resetStudio()
      // Симулирует то, что делает lib/store/persist.ts при монтировании StudioShell
      // с чистым localStorage: currentProjectId гидрируется из eg-current-project
      // НЕЗАВИСИМО от локального документа доски - его в этом тесте нет вовсе.
      useStudio.getState().restoreCurrentProjectId('project-restored')
    })
  })

  afterEach(() => {
    listActiveSeriesResult.current = { ok: true, data: { series: [], shots: [] } }
    listPromoSeriesResult.current = { ok: true, data: { series: [], shots: [] } }
  })

  it('уже готовый кадр подхватывается по восстановленному projectId, без клика «Собрать серию»', async () => {
    renderWithAccess('pro', 4)
    await waitFor(() => expect(listPromoSeriesInput).toHaveBeenCalledWith('project-restored'))
    await waitFor(() => expect(screen.getByTestId('promo-shot-done')).toBeTruthy())
    // Плашка проекта разрешилась в успех, а не висит вечно на "Saving...".
    expect(screen.getByTestId('promo-project-plaque').textContent ?? '').not.toBe('')
  })
})

/**
 * Баг ручной приёмки 15.08.2026: выбор кадров жил локальным useState внутри
 * PhotoSeries, а StudioShell рисует одну вкладку за раз - уход на «Проекты» и
 * обратно размонтировал панель вместе с выбором, и вместо одного отмеченного
 * кадра снова оказывались дефолтные четыре («Спишется 4»). Плюс гидратация
 * прошлой серии затирала выбор, сделанный руками.
 */
describe('PromoPanel: выбор пресетов переживает переключение вкладок', () => {
  beforeEach(() => {
    listActiveSeriesResult.current = { ok: true, data: { series: [], shots: [] } }
    listPromoSeriesResult.current = { ok: true, data: { series: [], shots: [] } }
    act(() => {
      useStudio.getState().resetStudio()
    })
  })

  it('снятые кадры остаются снятыми после ухода на другую вкладку и возврата', () => {
    const first = render(<PromoPanel />)
    for (const kind of ['serving', 'macroOil', 'package']) {
      fireEvent.click(screen.getByTestId(`promo-preset-${kind}`))
    }
    expect(screen.getByTestId('promo-cost').textContent ?? '').toContain('1')

    // Уход на другую вкладку: StudioShell размонтирует PromoPanel целиком.
    first.unmount()
    render(<PromoPanel />)

    expect(screen.getByTestId('promo-preset-hero').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('promo-preset-serving').getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByTestId('promo-cost').textContent ?? '').toContain('1')
  })

  it('гидратация прошлой серии не затирает выбор, сделанный руками', async () => {
    const shots = ['hero', 'serving', 'macroOil', 'package'].map((kind, i) => ({
      id: `shot-${kind}`,
      seriesId: 'series-old',
      kindSlug: kind,
      ordinal: i,
      status: 'done' as const,
      parentShotId: null,
      variantNo: 1,
      editPrompt: null,
      url: `https://storage.example/${kind}.png`,
      width: 1024,
      height: 1024,
      provider: 'fal',
      prompt: 'a board',
      error: null,
      retries: 0,
    }))
    listActiveSeriesResult.current = {
      ok: true,
      data: {
        series: [{
          id: 'series-old',
          projectId: 'project-1',
          source: 'presets' as const,
          status: 'done' as const,
          requested: 4,
          succeeded: 4,
          failed: 0,
          createdAt: '2026-08-01T00:00:00.000Z',
          finishedAt: '2026-08-01T00:01:00.000Z',
        }],
        shots,
      },
    }
    act(() => {
      usePromoStore.getState().setSelectedKinds(['catalog'])
    })

    renderWithAccess('pro', 4)
    // Ждём, пока гидратация действительно доедет: серия из базы уже в панели.
    await waitFor(() => expect(screen.getByTestId('promo-series-progress')).toBeTruthy())

    expect(screen.getByTestId('promo-preset-catalog').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('promo-preset-hero').getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByTestId('promo-cost').textContent ?? '').toContain('1')
  })
})

/**
 * Баг ручной приёмки 15.08.2026: счётчик кадров под кнопкой приезжал снапшотом
 * из серверного layout и после генерации не менялся вовсе. Человек видел
 * «Осталось 7 кадров» при двух на балансе, жал генерацию и упирался в отказ.
 */
describe('PromoPanel: счётчик кадров после списания', () => {
  beforeEach(() => {
    createSeriesInput.mockClear()
    listActiveSeriesResult.current = { ok: true, data: { series: [], shots: [] } }
    listPromoSeriesResult.current = { ok: true, data: { series: [], shots: [] } }
    act(() => {
      useStudio.getState().resetStudio()
    })
  })

  it('после генерации серии остаток перечитывается с сервера, а не остаётся снапшотом', async () => {
    // На балансе честно осталось 3 кадра, а страница была отрендерена, когда их было 7.
    readAiAccessResult.current = aiAccess('credits', 0, 0, 3)
    renderWithAccess('credits', 0, 0, 7)
    expect(screen.getByTestId('promo-gate').textContent ?? '').toContain('Осталось 7 кадров')

    fireEvent.click(screen.getByTestId('promo-generate'))
    await waitFor(() => expect(createSeriesInput).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByTestId('promo-gate').textContent ?? '').toContain('Осталось 3 кадров'))
  })
})

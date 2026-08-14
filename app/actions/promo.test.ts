import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AiVerdict } from '@/lib/ai/entitlements'
import type { AiAccess } from '@/lib/ai/quota'
import type { ImageOutcome, ImageProvider, ImageRequest, ImageTier } from '@/lib/ai/providers/types'
import type { RateLimitVerdict } from '@/lib/promo/rateLimit'

let gemini = true
let printful = true
let supabase = false
let user: { id: string } | null = null
let verdict: RateLimitVerdict = 'ok'
const take = vi.fn<(key: string, limit: number, now: number) => RateLimitVerdict>(() => verdict)

const GRANT: AiVerdict = { ok: true, tier: 'pro', userId: 'user-1', period: '2026-08', cost: 1, used: 1, remaining: 29 }
let aiVerdict: AiVerdict = GRANT
const ACCESS_PRO: AiAccess = { state: 'pro', limit: 30, used: 1, remaining: 29, tier: 'pro' }
let aiAccessResult: AiAccess = ACCESS_PRO
const release = vi.fn()
const allowed = vi.fn<(feature: string, units?: number) => void>()
const accessCalled = vi.fn()

// Сам гейт проверяется в lib/ai/entitlements.test.ts: здесь важно только то,
// что действие его спрашивает, уважает отказ и возвращает резерв при пустой серии.
vi.mock('@/lib/ai/entitlements', () => ({
  assertAiAllowed: (feature: string, units?: number) => {
    allowed(feature, units)
    return Promise.resolve(aiVerdict)
  },
  releaseAiQuota: (grant: unknown) => {
    release(grant)
    return Promise.resolve()
  },
  isAiDemoMode: () => !gemini,
  getAiAccess: () => {
    accessCalled()
    return Promise.resolve(aiAccessResult)
  },
}))

// Провайдерская абстракция замокана целиком: сеть проверяется в
// lib/ai/providers/*.test.ts, здесь важна только оркестрация действия.
const generate = vi.fn<(req: ImageRequest) => Promise<ImageOutcome>>()
const resolveImageProvider = vi.fn((tier: ImageTier) => ({ id: 'gemini', tier, generate }) as ImageProvider)
vi.mock('@/lib/ai/providers', () => ({ resolveImageProvider: (tier: ImageTier) => resolveImageProvider(tier) }))

// Загрузка макета в Storage: тест не должен ходить в Supabase.
let uploaded: { path: string; url: string } | null = { path: 'user-1/a.png', url: 'https://cdn.example/a.png' }
const removed = vi.fn<(path: string) => void>()
vi.mock('@/lib/promo/storage', () => ({
  uploadArtwork: () => Promise.resolve(uploaded),
  removeArtwork: (path: string) => {
    removed(path)
    return Promise.resolve()
  },
}))

vi.mock('@/lib/promo/config', () => ({
  GEMINI_API_KEY: 'test-gemini',
  PRINTFUL_API_KEY: 'test-printful',
  PRINTFUL_STORE_ID: '4242',
  isGeminiConfigured: () => gemini,
  isPrintfulConfigured: () => printful,
}))

vi.mock('@/lib/promo/rateLimit', async () => {
  const actual = await vi.importActual<typeof import('@/lib/promo/rateLimit')>('@/lib/promo/rateLimit')
  return { ...actual, promoLimiter: { take: (k: string, l: number, n: number) => take(k, l, n) } }
})

vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' })),
}))

vi.mock('@/lib/supabase/config', () => ({ isSupabaseConfigured: () => supabase }))
vi.mock('@/lib/supabase/session', () => ({ getCurrentUser: () => Promise.resolve(user) }))

// Base64 настоящего PNG всегда начинается с магии iVBORw0KGgo.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB'
/** Набор по умолчанию: те же четыре кадра, что серия рисовала до расширения пресетов. */
const KINDS = ['hero', 'serving', 'macroOil', 'package']
const INPUT = { boardPng: PNG, description: 'end-grain board, walnut and maple', kinds: KINDS }

function image(dataUrl = 'data:image/png;base64,AAAA'): ImageOutcome {
  return { kind: 'image', dataUrl, provider: 'gemini' }
}
function blocked(): ImageOutcome {
  return { kind: 'blocked', provider: 'gemini' }
}
function failed(retryable = true): ImageOutcome {
  return { kind: 'failed', provider: 'gemini', retryable }
}

function resetCommon(): void {
  gemini = true
  printful = true
  supabase = false
  user = null
  verdict = 'ok'
  aiVerdict = GRANT
  aiAccessResult = ACCESS_PRO
  release.mockClear()
  allowed.mockClear()
  accessCalled.mockClear()
  take.mockClear()
  resolveImageProvider.mockClear()
  generate.mockReset()
  generate.mockResolvedValue(image())
  vi.spyOn(console, 'error').mockImplementation(() => {})
}

describe('app/actions/promo: серия фото', () => {
  beforeEach(resetCommon)

  it('без ключа Gemini возвращает мок-режим, счётчик не трогает и в провайдер не ходит', async () => {
    gemini = false
    const { generatePromoShotsAction } = await import('./promo')
    const res = await generatePromoShotsAction(INPUT)
    expect(res).toEqual({ ok: true, mock: true, kinds: KINDS })
    expect(generate).not.toHaveBeenCalled()
    expect(take).not.toHaveBeenCalled()
  })

  it('мусор на входе даёт invalid и в провайдер не ходит', async () => {
    const { generatePromoShotsAction } = await import('./promo')
    expect(await generatePromoShotsAction({ boardPng: 'https://example.com/a.png', description: 'x' })).toEqual({
      ok: false,
      error: 'invalid',
    })
    expect(await generatePromoShotsAction({ boardPng: PNG, description: '', kinds: KINDS })).toEqual({ ok: false, error: 'invalid' })
    // Пустой набор пресетов это тоже мусор: генерировать нечего.
    expect(await generatePromoShotsAction({ ...INPUT, kinds: [] })).toEqual({ ok: false, error: 'invalid' })
    expect(await generatePromoShotsAction({ ...INPUT, kinds: ['nope'] })).toEqual({ ok: false, error: 'invalid' })
    expect(generate).not.toHaveBeenCalled()
  })

  it('data-url без магии PNG отбивается как invalid', async () => {
    const { generatePromoShotsAction } = await import('./promo')
    const res = await generatePromoShotsAction({ ...INPUT, boardPng: 'data:image/png;base64,AAAAAAAAAAAA' })
    expect(res).toEqual({ ok: false, error: 'invalid' })
    expect(generate).not.toHaveBeenCalled()
  })

  it('превышение лимита даёт rateLimited и ни одного платного запроса', async () => {
    verdict = 'ip'
    const { generatePromoShotsAction } = await import('./promo')
    expect(await generatePromoShotsAction(INPUT)).toEqual({ ok: false, error: 'rateLimited' })
    expect(generate).not.toHaveBeenCalled()
  })

  it('дневной потолок тоже даёт rateLimited', async () => {
    verdict = 'daily'
    const { generatePromoShotsAction } = await import('./promo')
    expect(await generatePromoShotsAction(INPUT)).toEqual({ ok: false, error: 'rateLimited' })
  })

  it('счётчик получает правый адрес цепочки x-forwarded-for и обычный лимит для гостя без Supabase', async () => {
    const { generatePromoShotsAction } = await import('./promo')
    await generatePromoShotsAction(INPUT)
    expect(take).toHaveBeenCalledTimes(1)
    // Левый элемент цепочки прислал клиент, доверять ему нельзя.
    expect(take.mock.calls[0]?.[0]).toBe('10.0.0.1')
    expect(take.mock.calls[0]?.[1]).toBe(5)
  })

  it('без Pro наружу не ходит и отдаёт код отказа', async () => {
    aiVerdict = { ok: false, reason: 'notPro', remaining: 0 }
    const { generatePromoShotsAction } = await import('./promo')
    expect(await generatePromoShotsAction(INPUT)).toEqual({ ok: false, error: 'notPro' })
    expect(generate).not.toHaveBeenCalled()
    expect(release).not.toHaveBeenCalled()
  })

  it('аноним получает свой код отказа, а не общий сбой', async () => {
    aiVerdict = { ok: false, reason: 'anonymous', remaining: 0 }
    const { generatePromoShotsAction } = await import('./promo')
    expect(await generatePromoShotsAction(INPUT)).toEqual({ ok: false, error: 'anonymous' })
  })

  it('выбранная квота отдаёт quota и ни одного платного запроса', async () => {
    aiVerdict = { ok: false, reason: 'quota', remaining: 0 }
    const { generatePromoShotsAction } = await import('./promo')
    expect(await generatePromoShotsAction(INPUT)).toEqual({ ok: false, error: 'quota' })
    expect(generate).not.toHaveBeenCalled()
  })

  it('удачная серия возвращает остаток квоты и резерв не возвращает', async () => {
    const { generatePromoShotsAction } = await import('./promo')
    const res = await generatePromoShotsAction(INPUT)
    if (!res.ok || res.mock) throw new Error('ожидались настоящие кадры')
    expect(res.remaining).toBe(29)
    expect(release).not.toHaveBeenCalled()
  })

  it('удачная серия подписывает провайдера, которым нарисован кадр', async () => {
    generate.mockResolvedValue({ kind: 'image', dataUrl: 'data:image/png;base64,AAAA', provider: 'fal' })
    const { generatePromoShotsAction } = await import('./promo')
    const res = await generatePromoShotsAction(INPUT)
    if (!res.ok || res.mock) throw new Error('ожидались настоящие кадры')
    expect(res.provider).toBe('fal')
  })

  it('серия без единого кадра возвращает списанную квоту обратно', async () => {
    generate.mockResolvedValue(failed())
    const { generatePromoShotsAction } = await import('./promo')
    expect(await generatePromoShotsAction(INPUT)).toEqual({ ok: false, error: 'failed' })
    expect(release).toHaveBeenCalledTimes(1)
    expect(release).toHaveBeenCalledWith(GRANT)
  })

  it('одного кадра достаточно, чтобы квота осталась списанной', async () => {
    let call = 0
    generate.mockImplementation(() => {
      call += 1
      return Promise.resolve(call === 1 ? image() : failed())
    })
    const { generatePromoShotsAction } = await import('./promo')
    const res = await generatePromoShotsAction(INPUT)
    expect(res.ok).toBe(true)
    expect(release).not.toHaveBeenCalled()
  })

  it('Supabase настроен, а человек не вошёл: лимит гостя тоже пятёрка', async () => {
    supabase = true
    user = null
    const { generatePromoShotsAction } = await import('./promo')
    await generatePromoShotsAction(INPUT)
    expect(take.mock.calls[0]?.[1]).toBe(5)
  })

  it('вошедший пользователь получает обычный лимит', async () => {
    supabase = true
    user = { id: 'user-1' }
    const { generatePromoShotsAction } = await import('./promo')
    await generatePromoShotsAction(INPUT)
    expect(take.mock.calls[0]?.[1]).toBe(5)
  })

  it('с провайдером делает четыре запроса и отдаёт четыре кадра', async () => {
    const { generatePromoShotsAction } = await import('./promo')
    const res = await generatePromoShotsAction(INPUT)
    expect(generate).toHaveBeenCalledTimes(4)
    if (!res.ok || res.mock) throw new Error('ожидались настоящие кадры')
    expect(res.images.map((i) => i.kind)).toEqual(KINDS)
    expect(res.images[0]?.dataUrl).toBe('data:image/png;base64,AAAA')
  })

  it('рендер доски уезжает провайдеру base64 без префикса data:', async () => {
    const { generatePromoShotsAction } = await import('./promo')
    await generatePromoShotsAction(INPUT)
    const req = generate.mock.calls[0]?.[0] as ImageRequest
    expect(req.referencePngBase64).toBe('iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB')
  })

  it('провайдер выбирается по тиру гранта: pro -> good', async () => {
    const { generatePromoShotsAction } = await import('./promo')
    await generatePromoShotsAction(INPUT)
    expect(resolveImageProvider).toHaveBeenCalledWith('good')
  })

  it('брошенный вызов на одном кадре не выбрасывает три остальных', async () => {
    let call = 0
    generate.mockImplementation(() => {
      call += 1
      return Promise.resolve(call === 1 ? failed() : image())
    })
    const { generatePromoShotsAction } = await import('./promo')
    const res = await generatePromoShotsAction(INPUT)
    expect(res.ok).toBe(true)
    if (!res.ok || res.mock) throw new Error('ожидались настоящие кадры')
    expect(res.images).toHaveLength(3)
  })

  it('отказ модели на всех кадрах отличается от сетевого сбоя', async () => {
    generate.mockResolvedValue(blocked())
    const { generatePromoShotsAction } = await import('./promo')
    expect(await generatePromoShotsAction(INPUT)).toEqual({ ok: false, error: 'blocked' })
  })

  it('упавшая сеть на всех кадрах даёт failed, а не исключение', async () => {
    generate.mockResolvedValue(failed())
    const { generatePromoShotsAction } = await import('./promo')
    expect(await generatePromoShotsAction(INPUT)).toEqual({ ok: false, error: 'failed' })
  })

  it('нет провайдера для тира (рассинхрон конфигурации): резерв возвращается, отказ unavailable', async () => {
    resolveImageProvider.mockReturnValueOnce(null as unknown as ImageProvider)
    const { generatePromoShotsAction } = await import('./promo')
    expect(await generatePromoShotsAction(INPUT)).toEqual({ ok: false, error: 'unavailable' })
    expect(generate).not.toHaveBeenCalled()
    expect(release).toHaveBeenCalledWith(GRANT)
  })
})

describe('app/actions/promo: пробный тир', () => {
  beforeEach(resetCommon)

  const TRIAL_GRANT: AiVerdict = {
    ok: true,
    tier: 'trial',
    subjects: [{ kind: 'guest', id: 'g-1', limit: 3 }, { kind: 'ip', id: 'hash', limit: 10 }],
    cost: 1,
    remaining: 2,
  }

  it('во free-тире набор режется до одного кадра ещё до резерва квоты', async () => {
    aiAccessResult = { state: 'trial', limit: 3, used: 1, remaining: 2, tier: 'trial' }
    aiVerdict = TRIAL_GRANT
    const { generatePromoShotsAction } = await import('./promo')
    const res = await generatePromoShotsAction(INPUT)
    expect(accessCalled).toHaveBeenCalledTimes(1)
    expect(allowed).toHaveBeenCalledWith('promoShots', 1)
    expect(generate).toHaveBeenCalledTimes(1)
    if (!res.ok || res.mock) throw new Error('ожидались настоящие кадры')
    expect(res.images).toHaveLength(1)
    expect(res.images[0]?.kind).toBe(KINDS[0])
  })

  it('четыре отмеченных кадра при трёх оставшихся всё равно режутся до одного', async () => {
    // Прод-сценарий: остаток квоты (3) больше, чем FREE_TRIAL_MAX_UNITS (1), но
    // потолок free-тира это цена ОДНОГО вызова, а не то, сколько ещё осталось.
    aiAccessResult = { state: 'trial', limit: 3, used: 0, remaining: 3, tier: 'trial' }
    aiVerdict = { ...TRIAL_GRANT, remaining: 2 }
    const { generatePromoShotsAction } = await import('./promo')
    const res = await generatePromoShotsAction(INPUT)
    expect(allowed).toHaveBeenCalledWith('promoShots', 1)
    expect(generate).toHaveBeenCalledTimes(1)
    if (!res.ok || res.mock) throw new Error('ожидались настоящие кадры')
    expect(res.images).toHaveLength(1)
    expect(res.remaining).toBe(2)
  })

  it('провайдер выбирается по тиру гранта: trial -> cheap', async () => {
    aiAccessResult = { state: 'trial', limit: 3, used: 1, remaining: 2, tier: 'trial' }
    aiVerdict = TRIAL_GRANT
    const { generatePromoShotsAction } = await import('./promo')
    await generatePromoShotsAction(INPUT)
    expect(resolveImageProvider).toHaveBeenCalledWith('cheap')
  })

  it('Pro не режет набор: тир pro отдаёт все выбранные кадры', async () => {
    aiAccessResult = ACCESS_PRO
    aiVerdict = GRANT
    const { generatePromoShotsAction } = await import('./promo')
    await generatePromoShotsAction(INPUT)
    expect(allowed).toHaveBeenCalledWith('promoShots', KINDS.length)
    expect(generate).toHaveBeenCalledTimes(KINDS.length)
  })

  it('исчерпанный пробный тир отдаёт trialSpent', async () => {
    aiAccessResult = { state: 'trialSpent', limit: 3, used: 3, remaining: 0, tier: 'trial' }
    aiVerdict = { ok: false, reason: 'trialSpent', remaining: 0 }
    const { generatePromoShotsAction } = await import('./promo')
    expect(await generatePromoShotsAction(INPUT)).toEqual({ ok: false, error: 'trialSpent' })
    expect(generate).not.toHaveBeenCalled()
  })
})

describe('app/actions/promo: выбор пресетов', () => {
  beforeEach(resetCommon)

  it('генерирует ровно отмеченные кадры, а не весь список пресетов', async () => {
    const { generatePromoShotsAction } = await import('./promo')
    const res = await generatePromoShotsAction({ ...INPUT, kinds: ['catalog', 'workbench'] })
    expect(generate).toHaveBeenCalledTimes(2)
    if (!res.ok || res.mock) throw new Error('ожидались настоящие кадры')
    expect(res.images.map((i) => i.kind)).toEqual(['catalog', 'workbench'])
  })

  it('квота резервируется по числу кадров, а не по нажатию кнопки', async () => {
    const { generatePromoShotsAction } = await import('./promo')
    await generatePromoShotsAction({ ...INPUT, kinds: ['hero', 'stack', 'island', 'edge', 'flatlay'] })
    expect(allowed).toHaveBeenCalledWith('promoShots', 5)
  })

  it('повтор пресета не оплачивается дважды и не рисуется дважды', async () => {
    const { generatePromoShotsAction } = await import('./promo')
    await generatePromoShotsAction({ ...INPUT, kinds: ['hero', 'hero', 'hero'] })
    expect(generate).toHaveBeenCalledTimes(1)
    expect(allowed).toHaveBeenCalledWith('promoShots', 1)
  })

  it('в промпт каждого кадра уезжает описание конкретной доски', async () => {
    const { generatePromoShotsAction } = await import('./promo')
    await generatePromoShotsAction({ ...INPUT, kinds: ['hands', 'macroOil'] })
    for (const call of generate.mock.calls) {
      const req = call[0] as ImageRequest
      expect(req.prompt).toContain('walnut and maple')
    }
  })
})

describe('app/actions/promo: разбор референса', () => {
  const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ'
  const STYLE = {
    lighting: 'Soft key from the left.',
    angle: 'Slightly above the subject.',
    background: 'Plain warm sweep.',
    palette: 'Warm neutrals.',
    composition: 'Off centre with negative space.',
    mood: 'Calm.',
    lens: '50mm at f/2.8.',
    postProcessing: 'Warm grade, film grain.',
  }

  function visionOk(payload: unknown): Response {
    return {
      ok: true,
      json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }),
    } as unknown as Response
  }

  beforeEach(() => {
    resetCommon()
    vi.unstubAllGlobals()
  })

  it('без ключа Gemini отдаёт демо-разбор и в сеть не ходит', async () => {
    gemini = false
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { analyzeReferenceAction } = await import('./promo')
    const res = await analyzeReferenceAction({ referenceImage: JPEG })
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error('ожидался разбор')
    expect(res.mock).toBe(true)
    expect(res.style.lighting).not.toBe('')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('файл не той природы отбивается по магии, а не по расширению', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { analyzeReferenceAction } = await import('./promo')
    // Заявлен PNG, а внутри что угодно: сигнатуры iVBORw0KGgo нет.
    expect(await analyzeReferenceAction({ referenceImage: 'data:image/png;base64,AAAAAAAA' })).toEqual({
      ok: false,
      error: 'invalid',
    })
    expect(await analyzeReferenceAction({ referenceImage: 'https://example.com/a.jpg' })).toEqual({
      ok: false,
      error: 'invalid',
    })
    // SVG не берём вовсе: он исполняет скрипты при открытии.
    expect(await analyzeReferenceAction({ referenceImage: 'data:image/svg+xml;base64,PHN2Zz4=' })).toEqual({
      ok: false,
      error: 'invalid',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('разбирает ответ модели и списывает одну единицу квоты', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(visionOk(STYLE)))
    const { analyzeReferenceAction } = await import('./promo')
    const res = await analyzeReferenceAction({ referenceImage: JPEG })
    if (!res.ok || res.mock) throw new Error('ожидался настоящий разбор')
    expect(res.style.lighting).toContain('Soft key')
    expect(res.remaining).toBe(29)
    expect(allowed).toHaveBeenCalledWith('referenceAnalysis', undefined)
  })

  it('vision-модель отдельная от рисующей и картинка уезжает телом запроса', async () => {
    const fetchMock = vi.fn().mockResolvedValue(visionOk(STYLE))
    vi.stubGlobal('fetch', fetchMock)
    const { analyzeReferenceAction } = await import('./promo')
    await analyzeReferenceAction({ referenceImage: JPEG })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('gemini-2.5-flash:generateContent')
    expect(url).not.toContain('test-gemini')
    const body = String(init.body)
    expect(body).toContain('image/jpeg')
    expect(body).toContain('responseSchema')
  })

  it('ответ без разбора возвращает квоту обратно', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: 'простите, не могу' }] } }] }),
    } as unknown as Response))
    const { analyzeReferenceAction } = await import('./promo')
    expect(await analyzeReferenceAction({ referenceImage: JPEG })).toEqual({ ok: false, error: 'failed' })
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('серия по референсу стоит дороже обычной и рисует запрошенное число кадров', async () => {
    const { generateReferenceShotsAction } = await import('./promo')
    const res = await generateReferenceShotsAction({ boardPng: PNG, description: 'board', style: STYLE, count: 3 })
    expect(allowed).toHaveBeenCalledWith('referenceShots', 3)
    expect(generate).toHaveBeenCalledTimes(3)
    if (!res.ok || res.mock) throw new Error('ожидались настоящие кадры')
    expect(res.images).toHaveLength(3)
    // Кадры одной серии обязаны отличаться, иначе человек платит за копии.
    const prompts = generate.mock.calls.map((call) => (call[0] as ImageRequest).prompt)
    expect(new Set(prompts).size).toBe(3)
  })

  it('в промпт по референсу уезжает наш предмет и разобранный свет', async () => {
    const { generateReferenceShotsAction } = await import('./promo')
    await generateReferenceShotsAction({ boardPng: PNG, description: 'walnut board', style: STYLE, count: 1 })
    const req = generate.mock.calls[0]?.[0] as ImageRequest
    expect(req.prompt).toContain('walnut board')
    expect(req.prompt).toContain('Soft key from the left')
  })

  it('больше четырёх кадров по референсу не заказать', async () => {
    const { generateReferenceShotsAction } = await import('./promo')
    expect(await generateReferenceShotsAction({ boardPng: PNG, description: 'b', style: STYLE, count: 9 })).toEqual({
      ok: false,
      error: 'invalid',
    })
    expect(generate).not.toHaveBeenCalled()
  })
})

describe('app/actions/promo: мерч через Printful', () => {
  const MERCH = { boardPng: PNG, products: ['tshirt', 'mug', 'poster', 'apron'] }

  /** Ответ создания задачи и ответ готового мокапа: fetch отвечает по адресу. */
  function printfulFetch(mockupUrl = 'https://printful.example/m.jpg') {
    return vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('create-task')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ result: { task_key: 'k1' } }) } as unknown as Response)
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ result: { status: 'completed', mockups: [{ mockup_url: mockupUrl }] } }),
      } as unknown as Response)
    })
  }

  beforeEach(() => {
    resetCommon()
    vi.unstubAllGlobals()
    uploaded = { path: 'user-1/a.png', url: 'https://cdn.example/a.png' }
  })

  it('без Pro отдаёт причину отказа и наружу не ходит', async () => {
    aiVerdict = { ok: false, reason: 'notPro', remaining: 0 }
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { createMerchMockupsAction } = await import('./promo')
    expect(await createMerchMockupsAction(MERCH)).toEqual({ printful: false, denied: 'notPro' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('без ключа Gemini вкладка в демо-режиме и гейта нет', async () => {
    gemini = false
    printful = false
    aiVerdict = { ok: false, reason: 'anonymous', remaining: 0 }
    const { createMerchMockupsAction } = await import('./promo')
    expect(await createMerchMockupsAction(MERCH)).toEqual({ printful: false })
  })

  it('мусор вместо рендера доски отбивается до всякой сети', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { createMerchMockupsAction } = await import('./promo')
    expect(await createMerchMockupsAction({ boardPng: 'data:image/png;base64,AAAA', products: ['mug'] })).toEqual({
      printful: true,
      error: 'invalid',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('без ключа Printful честно отвечает printful: false и макет никуда не выкладывает', async () => {
    printful = false
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { createMerchMockupsAction } = await import('./promo')
    expect(await createMerchMockupsAction(MERCH)).toEqual({ printful: false })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(removed).not.toHaveBeenCalled()
  })

  it('пустой или чужой список товаров отбивается схемой', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { createMerchMockupsAction } = await import('./promo')
    expect((await createMerchMockupsAction({ boardPng: PNG, products: [] })).error).toBe('invalid')
    expect((await createMerchMockupsAction({ boardPng: PNG, products: ['hat'] })).error).toBe('invalid')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('в Printful уходят только отмеченные товары, а не весь каталог', async () => {
    aiVerdict = { ok: true, tier: 'pro', userId: 'user-1', period: '2026-08', cost: 0, used: 0, remaining: 30 }
    const fetchMock = printfulFetch()
    vi.stubGlobal('fetch', fetchMock)
    const { createMerchMockupsAction } = await import('./promo')
    const res = await createMerchMockupsAction({ boardPng: PNG, products: ['mug', 'mug', 'poster'] })
    // Повтор схлопнут: лимит Printful тратить дважды на одну картинку незачем.
    expect(res.mockups?.map((m) => m.id)).toEqual(['mug', 'poster'])
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes('create-task'))).toHaveLength(2)
  })

  it('лимит Printful это отдельный код busy, а не общий сбой', async () => {
    aiVerdict = { ok: true, tier: 'pro', userId: 'user-1', period: '2026-08', cost: 0, used: 0, remaining: 30 }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: () => Promise.resolve({ error: { message: "You've recently sent too many requests." } }),
    } as unknown as Response))
    const { createMerchMockupsAction } = await import('./promo')
    expect((await createMerchMockupsAction(MERCH)).error).toBe('busy')
  })

  it('полный путь: макет в Storage, задача на каждый товар, поллинг и уборка', async () => {
    aiVerdict = { ok: true, tier: 'pro', userId: 'user-1', period: '2026-08', cost: 0, used: 0, remaining: 30 }
    const fetchMock = printfulFetch()
    vi.stubGlobal('fetch', fetchMock)
    const { createMerchMockupsAction } = await import('./promo')
    const res = await createMerchMockupsAction(MERCH)
    expect(res.printful).toBe(true)
    expect(res.mockups?.map((m) => m.id)).toEqual(['tshirt', 'mug', 'poster', 'apron'])
    expect(res.mockups?.[0]?.url).toBe('https://printful.example/m.jpg')
    // Четыре create-task плюс четыре опроса.
    expect(fetchMock).toHaveBeenCalledTimes(8)
    // Макет в публичном bucket не переживает запрос.
    expect(removed).toHaveBeenCalledWith('user-1/a.png')
  })

  it('в Printful уезжает публичный адрес макета, ключ заголовком и id магазина', async () => {
    aiVerdict = { ok: true, tier: 'pro', userId: 'user-1', period: '2026-08', cost: 0, used: 0, remaining: 30 }
    const fetchMock = printfulFetch()
    vi.stubGlobal('fetch', fetchMock)
    const { createMerchMockupsAction } = await import('./promo')
    await createMerchMockupsAction(MERCH)
    const create = fetchMock.mock.calls.find((call) => String(call[0]).includes('create-task')) as [string, RequestInit]
    expect(create[0]).toContain('api.printful.com/mockup-generator/create-task/')
    expect(create[0]).not.toContain('test-printful')
    const headers = create[1].headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer test-printful')
    expect(headers['X-PF-Store-Id']).toBe('4242')
    const body = JSON.parse(String(create[1].body)) as { files: { image_url: string; position: { width: number; height: number } }[] }
    expect(body.files[0]?.image_url).toBe('https://cdn.example/a.png')
    // Узор квадратный: вписываем его по меньшей стороне области печати.
    expect(body.files[0]?.position.width).toBe(body.files[0]?.position.height)
  })

  it('упавшая загрузка макета не даёт ни одного запроса в Printful', async () => {
    aiVerdict = { ok: true, tier: 'pro', userId: 'user-1', period: '2026-08', cost: 0, used: 0, remaining: 30 }
    uploaded = null
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { createMerchMockupsAction } = await import('./promo')
    expect(await createMerchMockupsAction(MERCH)).toEqual({ printful: true, error: 'storage' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('нехватка store_id объясняется отдельным кодом, а не общим сбоем', async () => {
    aiVerdict = { ok: true, tier: 'pro', userId: 'user-1', period: '2026-08', cost: 0, used: 0, remaining: 30 }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: { message: 'This endpoint requires `store_id`!' } }),
    } as unknown as Response))
    const { createMerchMockupsAction } = await import('./promo')
    const res = await createMerchMockupsAction(MERCH)
    expect(res).toEqual({ printful: true, error: 'notConfigured' })
    // Даже когда всё пошло не так, макет из публичного bucket убирается.
    expect(removed).toHaveBeenCalledWith('user-1/a.png')
  })

  it('отбитый Printful не роняет вкладку: возвращается код причины, а не исключение', async () => {
    aiVerdict = { ok: true, tier: 'pro', userId: 'user-1', period: '2026-08', cost: 0, used: 0, remaining: 30 }
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const { createMerchMockupsAction } = await import('./promo')
    expect(await createMerchMockupsAction(MERCH)).toEqual({ printful: true, error: 'failed' })
  })

  it('частичный успех отдаёт то, что вышло, а не общий отказ', async () => {
    aiVerdict = { ok: true, tier: 'pro', userId: 'user-1', period: '2026-08', cost: 0, used: 0, remaining: 30 }
    let create = 0
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('create-task')) {
        create += 1
        if (create === 1) return Promise.reject(new Error('network down'))
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ result: { task_key: 'k' } }) } as unknown as Response)
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ result: { status: 'completed', mockups: [{ mockup_url: 'https://p/x.jpg' }] } }),
      } as unknown as Response)
    }))
    const { createMerchMockupsAction } = await import('./promo')
    const res = await createMerchMockupsAction(MERCH)
    expect(res.error).toBeUndefined()
    expect(res.mockups).toHaveLength(3)
  })

  it('в лог не утекает ключ Printful', async () => {
    aiVerdict = { ok: true, tier: 'pro', userId: 'user-1', period: '2026-08', cost: 0, used: 0, remaining: 30 }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: { message: 'Unauthorized' } }),
    } as unknown as Response))
    const { createMerchMockupsAction } = await import('./promo')
    await createMerchMockupsAction(MERCH)
    for (const call of spy.mock.calls) expect(String(call[0])).not.toContain('test-printful')
  })
})

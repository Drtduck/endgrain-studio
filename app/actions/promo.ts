'use server'

import { headers } from 'next/headers'
import { assertAiAllowed, isAiDemoMode, releaseAiQuota, type AiGrant } from '@/lib/ai/entitlements'
import {
  GEMINI_API_KEY,
  PRINTFUL_API_KEY,
  PRINTFUL_STORE_ID,
  isGeminiConfigured,
  isPrintfulConfigured,
} from '@/lib/promo/config'
import {
  PROMO_DEFAULT_SHOTS,
  type MerchError,
  type MerchMockup,
  type MerchResult,
  type PromoError,
  type PromoImage,
  type PromoResult,
  type PromoShotKind,
} from '@/lib/promo/types'
import { shotPrompt } from '@/lib/promo/prompts'
import {
  ANALYSIS_PROMPT,
  ANALYSIS_RESPONSE_SCHEMA,
  normalizeStyle,
  parseStyleAnalysis,
  referencePrompt,
  type StyleAnalysis,
} from '@/lib/promo/reference'
import { merchSchema, promoShotsSchema, referenceAnalyzeSchema, referenceShotsSchema } from '@/lib/promo/schema'
import { generateMockup, type PrintfulAuth, type PrintfulError } from '@/lib/promo/printful'
import { removeArtwork, uploadArtwork } from '@/lib/promo/storage'
import { PER_IP_PER_HOUR, PER_IP_PER_HOUR_ANON, clientIp, promoLimiter } from '@/lib/promo/rateLimit'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { getCurrentUser } from '@/lib/supabase/session'

const GEMINI_MODEL = 'gemini-2.5-flash-image'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

/**
 * Разбор референса это текстовая задача с картинкой на входе, рисовать тут
 * нечего, поэтому модель другая: обычная flash с vision. Она и дешевле, и
 * умеет responseSchema, чего image-модель не умеет вовсе.
 */
const GEMINI_VISION_MODEL = 'gemini-2.5-flash'
const GEMINI_VISION_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_VISION_MODEL}:generateContent`

/** Картинка иногда рисуется долго, но висеть до бесконечности запрос не имеет права. */
const REQUEST_TIMEOUT_MS = 30_000

/** Разбор кадра это несколько сотен токенов текста: столько ждать незачем. */
const VISION_TIMEOUT_MS = 20_000

interface GeminiPart {
  readonly text?: string
  readonly inlineData?: { readonly mimeType?: string; readonly data?: string }
  readonly inline_data?: { readonly mime_type?: string; readonly data?: string }
}
interface GeminiResponse {
  readonly candidates?: readonly { readonly content?: { readonly parts?: readonly GeminiPart[] } }[]
  readonly error?: { readonly status?: string; readonly code?: number }
}

/** Первая картинка из ответа. Gemini кладёт рядом с ней текст, его молча выбрасываем. */
function firstImage(body: GeminiResponse): string | null {
  const parts = body.candidates?.[0]?.content?.parts ?? []
  for (const part of parts) {
    const data = part.inlineData?.data ?? part.inline_data?.data
    const mime = part.inlineData?.mimeType ?? part.inline_data?.mime_type ?? 'image/png'
    if (typeof data === 'string' && data.length > 0) return `data:${mime};base64,${data}`
  }
  return null
}

/** Весь текст ответа одной строкой: JSON модель иногда режет на несколько частей. */
function allText(body: GeminiResponse): string {
  return (body.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? '')
    .join('')
    .trim()
}

/** base64 из data-url. Сам data-url уже проверен zod-схемой на магию файла. */
function payload(dataUrl: string): { readonly mimeType: string; readonly data: string } {
  const comma = dataUrl.indexOf(',')
  const mimeType = dataUrl.slice(5, dataUrl.indexOf(';'))
  return { mimeType, data: dataUrl.slice(comma + 1) }
}

/** Что вышло с одним кадром: картинка, отказ модели по своим правилам или сбой. */
type ShotOutcome = { readonly kind: 'image'; readonly image: PromoImage } | 'blocked' | 'failed'

async function requestShot(kind: PromoShotKind, prompt: string, base64: string): Promise<ShotOutcome> {
  try {
    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'x-goog-api-key': GEMINI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: 'image/png', data: base64 } }] },
        ],
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!res.ok) {
      // В лог уходит только статус и код ошибки: ни тела ответа, ни тем более ключа.
      let code = ''
      try {
        code = ((await res.json()) as GeminiResponse).error?.status ?? ''
      } catch {
        code = ''
      }
      console.error(`gemini ${kind}: HTTP ${res.status}${code === '' ? '' : ` ${code}`}`)
      return 'failed'
    }
    const body = (await res.json()) as GeminiResponse
    const dataUrl = firstImage(body)
    if (dataUrl !== null) return { kind: 'image', image: { kind, dataUrl } }
    // 200 без единого кандидата это отказ модели по своим правилам, а не сбой связи.
    console.error(`gemini ${kind}: ответ без картинки`)
    return (body.candidates?.length ?? 0) === 0 ? 'blocked' : 'failed'
  } catch (err) {
    // Таймаут, обрыв сети или битый JSON: кадр теряем, серию нет.
    console.error(`gemini ${kind}: ${err instanceof Error ? err.name : 'unknown error'}`)
    return 'failed'
  }
}

/** Первый рубеж всех платных действий: счётчик по адресу, до похода в базу. */
async function passRateLimit(): Promise<boolean> {
  const head = await headers()
  // Аккаунты в проекте есть, а человек не вошёл: лимит жёстче, и до платного
  // вызова он всё равно не дойдёт, но пусть флуд отвалится подешевле.
  const anonymous = isSupabaseConfigured() && (await getCurrentUser()) === null
  const verdict = promoLimiter.take(
    clientIp(head.get('x-forwarded-for'), head.get('x-real-ip')),
    anonymous ? PER_IP_PER_HOUR_ANON : PER_IP_PER_HOUR,
    Date.now(),
  )
  return verdict === 'ok'
}

/** Серия кадров одним заходом: параллельные запросы, общий разбор исходов. */
async function runSeries(
  jobs: readonly { readonly kind: PromoShotKind; readonly prompt: string }[],
  base64: string,
  grant: AiGrant,
): Promise<PromoResult> {
  // Кадры параллельно: последовательно двенадцать штук это минуты ожидания на
  // пустом экране. Каждый ловит свои ошибки сам, поэтому один обрыв не
  // выбрасывает одиннадцать оплаченных.
  const outcomes = await Promise.all(jobs.map((job) => requestShot(job.kind, job.prompt, base64)))

  const images = outcomes.flatMap((outcome) => (typeof outcome === 'string' ? [] : [outcome.image]))
  if (images.length > 0) return { ok: true, mock: false, images, remaining: grant.remaining }

  // Ни одного кадра: серия не состоялась, значит и списывать не за что.
  await releaseAiQuota(grant)
  return { ok: false, error: outcomes.every((outcome) => outcome === 'blocked') ? 'blocked' : 'failed' }
}

/**
 * Серия продуктовых кадров через Gemini (модель gemini-2.5-flash-image, она же Nano Banana).
 * Ключ читается только здесь, на сервере: в клиентский бандл он не попадает никогда.
 * Без ключа возвращаем mock: true, и вкладка рисует собственные заглушки поверх рендера доски.
 *
 * Пресетов двенадцать, но генерируются только отмеченные: каждый кадр стоит
 * единицу квоты, и решать, за что платить, должен человек, а не набор по умолчанию.
 *
 * Два рубежа, и оба обязательны. Первый - счётчик из lib/promo/rateLimit: он в памяти
 * процесса, стоит ноль и режет флуд до похода в базу. Второй - assertAiAllowed: сессия,
 * Pro и месячная квота в Postgres, то есть единственная защита, которую нельзя ни
 * подделать заголовком, ни обнулить перезапуском инстанса.
 *
 * maxDuration для этого действия задан на странице, которая его вызывает (app/page.tsx):
 * из файла с 'use server' Next разрешает экспортировать только асинхронные функции.
 */
export async function generatePromoShotsAction(input: unknown): Promise<PromoResult> {
  const parsed = promoShotsSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }

  // Повторы в наборе оплачивались бы дважды за одну и ту же картинку.
  const kinds = [...new Set(parsed.data.kinds)]

  // Ключа нет: наружу никто не идёт, платить не за что, поэтому и квоту не трогаем.
  if (!isGeminiConfigured()) return { ok: true, mock: true, kinds }

  if (!(await passRateLimit())) return { ok: false, error: 'rateLimited' }

  // Квота резервируется здесь, до обращения к модели: иначе параллельные запросы
  // прочитали бы один и тот же остаток и все прошли бы. Возврат внутри runSeries.
  const grant = await assertAiAllowed('promoShots', kinds.length)
  if (!grant.ok) return { ok: false, error: grant.reason }

  const base64 = payload(parsed.data.boardPng).data
  return runSeries(
    kinds.map((kind) => ({ kind, prompt: shotPrompt(kind, parsed.data.description) })),
    base64,
    grant,
  )
}

export type ReferenceAnalysisResult =
  | { readonly ok: true; readonly mock: true; readonly style: StyleAnalysis }
  | { readonly ok: true; readonly mock: false; readonly style: StyleAnalysis; readonly remaining: number }
  | { readonly ok: false; readonly error: PromoError }

/** Разбор-заглушка на случай, когда ключа Gemini нет: видно, что именно спрашивают у модели. */
const DEMO_STYLE: StyleAnalysis = {
  lighting: 'Soft directional key light from the left, wide shadows, low contrast ratio.',
  angle: 'Camera slightly above the subject, tilted about 20 degrees down.',
  background: 'Plain warm backdrop falling into shadow towards the corners.',
  palette: 'Warm neutrals with amber highlights, moderate saturation.',
  composition: 'Subject slightly off centre with negative space on the right.',
  mood: 'Calm, handmade, unhurried.',
  lens: '50mm look at a moderate aperture, background gently out of focus.',
  postProcessing: 'Warm grade, lifted blacks, light film grain.',
}

/**
 * Шаг 1 генерации по референсу: раскладываем чужой кадр на приёмы съёмки.
 *
 * Возвращаем разбор пользователю до генерации сознательно: человек видит, что
 * модель поняла, правит формулировки и только потом платит квотой за картинки.
 * Молча превратить фото в промпт и сразу списать четыре кадра было бы дороже
 * и непрозрачнее.
 */
export async function analyzeReferenceAction(input: unknown): Promise<ReferenceAnalysisResult> {
  const parsed = referenceAnalyzeSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }

  if (!isGeminiConfigured()) return { ok: true, mock: true, style: DEMO_STYLE }

  if (!(await passRateLimit())) return { ok: false, error: 'rateLimited' }

  const grant = await assertAiAllowed('referenceAnalysis')
  if (!grant.ok) return { ok: false, error: grant.reason }

  const image = payload(parsed.data.referenceImage)
  try {
    const res = await fetch(GEMINI_VISION_URL, {
      method: 'POST',
      headers: { 'x-goog-api-key': GEMINI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: ANALYSIS_PROMPT }, { inlineData: image }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: ANALYSIS_RESPONSE_SCHEMA },
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(VISION_TIMEOUT_MS),
    })
    if (!res.ok) {
      let code = ''
      try {
        code = ((await res.json()) as GeminiResponse).error?.status ?? ''
      } catch {
        code = ''
      }
      console.error(`gemini reference: HTTP ${res.status}${code === '' ? '' : ` ${code}`}`)
      await releaseAiQuota(grant)
      return { ok: false, error: 'failed' }
    }
    const body = (await res.json()) as GeminiResponse
    const style = parseStyleAnalysis(allText(body))
    if (style === null) {
      // Ответ без разбора: чаще всего модель отказалась смотреть на картинку.
      console.error('gemini reference: ответ без разбора')
      await releaseAiQuota(grant)
      return { ok: false, error: (body.candidates?.length ?? 0) === 0 ? 'blocked' : 'failed' }
    }
    return { ok: true, mock: false, style, remaining: grant.remaining }
  } catch (err) {
    console.error(`gemini reference: ${err instanceof Error ? err.name : 'unknown error'}`)
    await releaseAiQuota(grant)
    return { ok: false, error: 'failed' }
  }
}

/**
 * Шаг 3 генерации по референсу: рисуем свою доску по разобранному рецепту.
 * Разбор приходит с клиента, уже показанный человеку и, возможно, им поправленный,
 * поэтому нормализуется здесь ещё раз: в промпт не должно уехать двух мегабайт текста.
 */
export async function generateReferenceShotsAction(input: unknown): Promise<PromoResult> {
  const parsed = referenceShotsSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const kinds = PROMO_DEFAULT_SHOTS.slice(0, parsed.data.count)
  if (!isGeminiConfigured()) return { ok: true, mock: true, kinds }

  if (!(await passRateLimit())) return { ok: false, error: 'rateLimited' }

  const grant = await assertAiAllowed('referenceShots', parsed.data.count)
  if (!grant.ok) return { ok: false, error: grant.reason }

  const style = normalizeStyle(parsed.data.style)
  const base64 = payload(parsed.data.boardPng).data
  return runSeries(
    kinds.map((kind, index) => ({ kind, prompt: referencePrompt(style, parsed.data.description, index) })),
    base64,
    grant,
  )
}

/** Код ошибки Printful в код, который понимает панель. */
function merchErrorFrom(error: PrintfulError): MerchError {
  switch (error) {
    case 'auth':
    case 'store':
      return 'notConfigured'
    case 'rejected':
      return 'rejected'
    case 'busy':
      return 'busy'
    case 'timeout':
      return 'timeout'
    case 'failed':
      return 'failed'
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Мокапы мерча через Printful Mockup Generator.
 *
 * Путь целиком: рендер доски приходит с клиента готовым PNG -> кладём его в
 * публичный bucket promo-mockups -> отдаём Printful публичный https-адрес
 * (data:URI он не принимает, файл тянет со своей стороны) -> создаём задачу на
 * каждый отмеченный товар -> опрашиваем task_key до готовности -> удаляем макет.
 *
 * Товары приходят списком, а не берутся все четыре: create-task у Printful
 * пускает пару запросов в минуту (замерено на живом ключе), и «собрать всё
 * разом» гарантированно упёрлось бы в 429 на половине товаров.
 *
 * Локальные силуэты никуда не делись: они рисуются в браузере всегда и остаются
 * на экране, если Printful недоступен. Вкладка не имеет права опустеть из-за
 * чужого сбоя, поэтому любая ошибка тут возвращает код причины, а не пустоту.
 *
 * Гейт стоит ради правила «промо-инструменты входят в Pro». Квоту мокапы не
 * тратят (стоимость 0 в AI_FEATURE_COST): генерация мокапа в Printful бесплатна,
 * и брать за неё единицу месячного лимита было бы враньём про цену.
 */
export async function createMerchMockupsAction(input: unknown): Promise<MerchResult> {
  const parsed = merchSchema.safeParse(input)
  if (!parsed.success) return { printful: isPrintfulConfigured(), error: 'invalid' }

  if (!isAiDemoMode()) {
    const grant = await assertAiAllowed('merchMockups')
    if (!grant.ok) return { printful: false, denied: grant.reason }
  }

  // Повторы оплачиваются лимитом Printful дважды за одну и ту же картинку.
  const products = [...new Set(parsed.data.products)]

  const printful = isPrintfulConfigured()
  if (!printful) return { printful: false }

  // Тот же счётчик, что у генерации кадров: каждый мокап это четыре задачи в
  // Printful и один файл в Storage, и без потолка это чужой бесплатный конвейер.
  if (!(await passRateLimit())) return { printful, error: 'rateLimited' }

  const user = await getCurrentUser()
  const uploaded = await uploadArtwork(user?.id ?? 'anon', payload(parsed.data.boardPng).data)
  if (uploaded === null) return { printful, error: 'storage' }

  const auth: PrintfulAuth = { apiKey: PRINTFUL_API_KEY, storeId: PRINTFUL_STORE_ID }
  try {
    const outcomes = await Promise.all(
      products.map((id) => generateMockup(id, uploaded.url, auth, fetch, sleep)),
    )
    const mockups = outcomes.flatMap((outcome): MerchMockup[] => (outcome.ok ? [outcome.value] : []))
    if (mockups.length > 0) return { printful, mockups }
    // Ни одного мокапа: причина у всех обычно одна, показываем первую.
    const first = outcomes.find((outcome) => !outcome.ok)
    return { printful, error: first === undefined || first.ok ? 'failed' : merchErrorFrom(first.error) }
  } finally {
    // Макет своё отработал в любом случае: держать чужие файлы в публичном
    // bucket дольше одного запроса не за чем.
    await removeArtwork(uploaded.path)
  }
}

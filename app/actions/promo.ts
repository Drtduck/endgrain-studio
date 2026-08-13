'use server'

import { headers } from 'next/headers'
import { assertAiAllowed, getAiAccess, isAiDemoMode, releaseAiQuota, type AiGrant } from '@/lib/ai/entitlements'
import { FREE_TRIAL_MAX_UNITS } from '@/lib/ai/quota'
import { resolveImageProvider } from '@/lib/ai/providers'
import {
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
import { normalizeStyle, referencePrompt, type StyleAnalysis } from '@/lib/promo/reference'
import { merchSchema, promoShotsSchema, referenceAnalyzeSchema, referenceShotsSchema } from '@/lib/promo/schema'
import { generateMockup, type PrintfulAuth, type PrintfulError } from '@/lib/promo/printful'
import { removeArtwork, uploadArtwork } from '@/lib/promo/storage'
import { PER_IP_PER_HOUR, PER_IP_PER_HOUR_ANON, clientIp, promoLimiter } from '@/lib/promo/rateLimit'
import { analyzeReferenceImage } from '@/lib/promo/visionAnalyze'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { getCurrentUser } from '@/lib/supabase/session'

/** base64 из data-url. Сам data-url уже проверен zod-схемой на магию файла. */
function payload(dataUrl: string): { readonly mimeType: string; readonly data: string } {
  const comma = dataUrl.indexOf(',')
  const mimeType = dataUrl.slice(5, dataUrl.indexOf(';'))
  return { mimeType, data: dataUrl.slice(comma + 1) }
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

/**
 * Серия кадров одним заходом: параллельные запросы через провайдерскую
 * абстракцию, общий разбор исходов. Провайдер выбирается по тиру гранта:
 * Pro рисует хорошей моделью (с fallback на fal, если оба ключа заведены),
 * пробный тир - дешёвой. Если для тира провайдера почему-то нет (защита от
 * рассинхрона конфигурации), серия не состоялась и резерв возвращается.
 */
async function runSeries(
  jobs: readonly { readonly kind: PromoShotKind; readonly prompt: string }[],
  base64: string,
  grant: AiGrant,
): Promise<PromoResult> {
  const provider = resolveImageProvider(grant.tier === 'pro' ? 'good' : 'cheap')
  if (provider === null) {
    await releaseAiQuota(grant)
    return { ok: false, error: 'unavailable' }
  }

  // Кадры параллельно: последовательно двенадцать штук это минуты ожидания на
  // пустом экране. Каждый ловит свои ошибки сам, поэтому один обрыв не
  // выбрасывает одиннадцать оплаченных.
  const outcomes = await Promise.all(
    jobs.map((job) => provider.generate({ prompt: job.prompt, referencePngBase64: base64 })),
  )

  const images: PromoImage[] = []
  for (const [index, outcome] of outcomes.entries()) {
    if (outcome.kind === 'image') images.push({ kind: jobs[index]!.kind, dataUrl: outcome.dataUrl })
  }
  if (images.length > 0) {
    // Кадры серии могут разойтись по провайдеру, если сработал fallback:
    // подпись берём с первого вышедшего кадра, панели этого достаточно.
    const usedProvider = outcomes.find((outcome) => outcome.kind === 'image')
    return {
      ok: true,
      mock: false,
      images,
      remaining: grant.remaining,
      ...(usedProvider?.kind === 'image' ? { provider: usedProvider.provider } : {}),
    }
  }

  // Ни одного кадра: серия не состоялась, значит и списывать не за что.
  await releaseAiQuota(grant)
  return { ok: false, error: outcomes.every((outcome) => outcome.kind === 'blocked') ? 'blocked' : 'failed' }
}

/**
 * Серия продуктовых кадров через провайдерскую абстракцию (Pro - Gemini
 * gemini-2.5-flash-image с fallback на fal, пробный тир - fal flux/schnell).
 * Ключи читаются только на сервере: в клиентский бандл они не попадают никогда.
 * Без ни одного ключа возвращаем mock: true, и вкладка рисует собственные
 * заглушки поверх рендера доски.
 *
 * Пресетов двенадцать, но генерируются только отмеченные: каждый кадр стоит
 * единицу квоты, и решать, за что платить, должен человек, а не набор по умолчанию.
 *
 * Два рубежа, и оба обязательны. Первый - счётчик из lib/promo/rateLimit: он в памяти
 * процесса, стоит ноль и режет флуд до похода в базу. Второй - assertAiAllowed: сессия,
 * Pro/пробный тир и квота в Postgres, то есть единственная защита, которую нельзя ни
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

  // Ни одного ключа: наружу никто не идёт, платить не за что, поэтому и квоту не трогаем.
  if (isAiDemoMode()) return { ok: true, mock: true, kinds }

  if (!(await passRateLimit())) return { ok: false, error: 'rateLimited' }

  // Во free-тире серия режется до одного кадра ещё здесь: assertAiAllowed
  // отказал бы целиком, увидев units > FREE_TRIAL_MAX_UNITS, а честнее
  // сгенерировать один кадр из отмеченных, чем не сгенерировать ни одного.
  // getAiAccess ничего не резервирует, это чистое чтение состояния.
  const access = await getAiAccess()
  const cappedKinds = access.tier === 'trial' ? kinds.slice(0, FREE_TRIAL_MAX_UNITS) : kinds

  // Квота резервируется здесь, до обращения к модели: иначе параллельные запросы
  // прочитали бы один и тот же остаток и все прошли бы. Возврат внутри runSeries.
  const grant = await assertAiAllowed('promoShots', cappedKinds.length)
  if (!grant.ok) return { ok: false, error: grant.reason }

  const base64 = payload(parsed.data.boardPng).data
  return runSeries(
    cappedKinds.map((kind) => ({ kind, prompt: shotPrompt(kind, parsed.data.description) })),
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
  const outcome = await analyzeReferenceImage(image)
  if (outcome.kind === 'style') return { ok: true, mock: false, style: outcome.style, remaining: grant.remaining }

  await releaseAiQuota(grant)
  return { ok: false, error: outcome.kind === 'blocked' ? 'blocked' : 'failed' }
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
  if (isAiDemoMode()) return { ok: true, mock: true, kinds }

  if (!(await passRateLimit())) return { ok: false, error: 'rateLimited' }

  // Тот же приём, что у серии по пресетам: во free-тире режем до одного кадра
  // до похода в assertAiAllowed, а не полагаемся на его отказ.
  const access = await getAiAccess()
  const cappedKinds = access.tier === 'trial' ? kinds.slice(0, FREE_TRIAL_MAX_UNITS) : kinds

  const grant = await assertAiAllowed('referenceShots', cappedKinds.length)
  if (!grant.ok) return { ok: false, error: grant.reason }

  const style = normalizeStyle(parsed.data.style)
  const base64 = payload(parsed.data.boardPng).data
  return runSeries(
    cappedKinds.map((kind, index) => ({ kind, prompt: referencePrompt(style, parsed.data.description, index) })),
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

'use server'

import { headers } from 'next/headers'
import { assertAiAllowed, getAiAccess, releaseAiQuota } from '@/lib/ai/entitlements'
import { aiCost, type AiAccess, type AiDenyReason, type AiFeature } from '@/lib/ai/quota'
import { compile } from '@/lib/engine'
import { parseDesign } from '@/lib/persist'
import {
  PRINTFUL_API_KEY,
  PRINTFUL_STORE_ID,
  isGeminiConfigured,
  isPrintfulConfigured,
} from '@/lib/promo/config'
import { boardAssetPath, uploadPromoAsset } from '@/lib/promo/assets'
import { describeBoard } from '@/lib/promo/describe'
import {
  fetchSeries,
  fetchShot,
  insertEditShot,
  insertSeries,
  listActiveSeries,
  listProjectSeries,
  settleSeries,
  shotsToViews,
  toSeriesView,
  type NewShot,
} from '@/lib/promo/db'
import { checkScene } from '@/lib/promo/promptGuard'
import { referenceRecipe, type StyleAnalysis } from '@/lib/promo/reference'
import { SCENES } from '@/lib/promo/prompts'
import { editPromoShotSchema, idSchema, merchSchema, promoSeriesSchema, referenceAnalyzeSchema } from '@/lib/promo/schema'
import { type MerchError, type MerchMockup, type MerchResult, type PromoSeriesView, type PromoShotView } from '@/lib/promo/types'
import { generateMockup, type PrintfulAuth, type PrintfulError } from '@/lib/promo/printful'
import { removeArtwork, uploadArtwork } from '@/lib/promo/storage'
import { PER_IP_PER_HOUR, PER_IP_PER_HOUR_ANON, clientIp, promoLimiter } from '@/lib/promo/rateLimit'
import { analyzeReferenceImage } from '@/lib/promo/visionAnalyze'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { getSupabaseService, isSupabaseServiceConfigured } from '@/lib/supabase/service'
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
  const anonymous = isSupabaseConfigured() && (await getCurrentUser()) === null
  const verdict = promoLimiter.take(
    clientIp(head.get('x-forwarded-for'), head.get('x-real-ip')),
    anonymous ? PER_IP_PER_HOUR_ANON : PER_IP_PER_HOUR,
    Date.now(),
  )
  return verdict === 'ok'
}

/** Коды, а не готовые фразы: текст выбирает клиент по своей локали. */
export type PromoActionError = AiDenyReason | 'invalid' | 'notFound' | 'rateLimited' | 'failed'
export type ActionResult<T> = { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: PromoActionError }

/** Куда отдаём остаток после отказа по деньгам: доводим до реального AiDenyReason по состоянию доступа. */
function insufficientReason(access: AiAccess): AiDenyReason {
  switch (access.state) {
    case 'pro':
      return 'quota'
    case 'trial':
    case 'trialSpent':
      return access.credits > 0 ? 'noCredits' : 'trialSpent'
    case 'credits':
      return 'noCredits'
    case 'free':
      return 'notPro'
    case 'anonymous':
      return 'anonymous'
    default:
      return 'unavailable'
  }
}

/**
 * Job-путь (P0-3): заводит серию и её кадры со статусом queued, ничего не
 * рисует и не списывает. Списание идёт поштучно из POST /api/promo/shot при
 * захвате каждого кадра (см. lib/ai/entitlements.assertAiAllowed, ref строит
 * lib/promo/spendRef.shotSpendRef из wallet_ref, id кадра и номера попытки) -
 * здесь только честная проверка «хватит ли кадров», чтобы не заводить серию,
 * заведомо обречённую на отказ по деньгам.
 *
 * description с клиента игнорируется (спека 6.3): сервер пересчитывает его
 * сам из design проекта по projectId, взятого из базы, а не с клиента.
 */
export async function createPromoSeriesAction(
  input: unknown,
): Promise<ActionResult<{ readonly seriesId: string; readonly shots: readonly PromoShotView[] }>> {
  const parsed = promoSeriesSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }

  if (!isSupabaseConfigured() || !isSupabaseServiceConfigured()) return { ok: false, error: 'unavailable' }

  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'anonymous' }

  if (!(await passRateLimit())) return { ok: false, error: 'rateLimited' }

  const sb = getSupabaseService()
  const { data: projectRow, error: projectError } = await sb
    .from('projects')
    .select('design')
    .eq('id', parsed.data.projectId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (projectError) return { ok: false, error: 'failed' }
  if (!projectRow) return { ok: false, error: 'notFound' }

  let design
  try {
    design = parseDesign(projectRow.design)
  } catch {
    return { ok: false, error: 'invalid' }
  }
  const model = compile(design)
  const boardDesc = describeBoard(design, model).text

  const data = parsed.data
  const feature: AiFeature = data.source === 'presets' ? 'promoShots' : 'referenceShots'

  let newShots: NewShot[]
  if (data.source === 'presets') {
    newShots = []
    for (const [index, shot] of data.shots.entries()) {
      if (shot.scene !== undefined) {
        const verdict = checkScene(shot.scene)
        if (!verdict.ok) return { ok: false, error: 'invalid' }
        newShots.push({ ordinal: index, kindSlug: shot.kind, scene: verdict.scene })
      } else {
        newShots.push({ ordinal: index, kindSlug: shot.kind, scene: SCENES[shot.kind] })
      }
    }
  } else {
    const style = data.style
    newShots = Array.from({ length: data.count }, (_, index) => ({
      ordinal: index,
      kindSlug: 'custom',
      scene: referenceRecipe(style, index),
    }))
  }

  // Честный подсчёт остатка ДО списания (спека 4.3): списание всё равно идёт
  // поштучно при исполнении, но заводить серию, которую нечем оплатить, незачем.
  const access = await getAiAccess()
  const units = aiCost(feature, newShots.length)
  if (access.remaining < units) return { ok: false, error: insufficientReason(access) }

  const boardBytes = payload(parsed.data.boardPng).data
  const uploadPath = boardAssetPath(user.id, crypto.randomUUID())
  const uploaded = await uploadPromoAsset(uploadPath, boardBytes)
  if (uploaded === null) return { ok: false, error: 'failed' }

  const inserted = await insertSeries({
    userId: user.id,
    projectId: parsed.data.projectId,
    source: parsed.data.source,
    walletRef: parsed.data.walletRef,
    boardDesc,
    boardPngPath: uploaded.path,
    shots: newShots,
  })
  if (inserted === null) return { ok: false, error: 'failed' }

  const views = await shotsToViews(inserted.shots)
  return { ok: true, data: { seriesId: inserted.series.id, shots: views } }
}

/** Кадры и серии проекта: подтягиваются при открытии панели, переживают перезагрузку страницы (P0-4). */
export async function listPromoSeriesAction(
  projectId: string,
): Promise<ActionResult<{ readonly series: readonly PromoSeriesView[]; readonly shots: readonly PromoShotView[] }>> {
  if (!idSchema.safeParse(projectId).success) return { ok: false, error: 'invalid' }
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'anonymous' }
  if (!isSupabaseServiceConfigured()) return { ok: false, error: 'unavailable' }

  const { series, shots } = await listProjectSeries(projectId, user.id)
  const views = await shotsToViews(shots)
  return { ok: true, data: { series: series.map(toSeriesView), shots: views } }
}

/** Брошенные серии текущего пользователя за последний час (спека 4.7, п.1): дорисовываются заново тем же runner'ом. */
export async function listActiveSeriesAction(): Promise<
  ActionResult<{ readonly series: readonly PromoSeriesView[]; readonly shots: readonly PromoShotView[] }>
> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'anonymous' }
  if (!isSupabaseServiceConfigured()) return { ok: false, error: 'unavailable' }

  const { series, shots } = await listActiveSeries(user.id)
  const views = await shotsToViews(shots)
  return { ok: true, data: { series: series.map(toSeriesView), shots: views } }
}

/**
 * Отмена (спека 5.3): не начатые кадры уходят в cancelled и не будут запущены
 * рannerом, running-кадры не трогаем - они уже списаны и доедут.
 */
export async function cancelPromoSeriesAction(seriesId: string): Promise<ActionResult<PromoSeriesView>> {
  if (!idSchema.safeParse(seriesId).success) return { ok: false, error: 'invalid' }
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'anonymous' }
  if (!isSupabaseServiceConfigured()) return { ok: false, error: 'unavailable' }

  const sb = getSupabaseService()
  const { error } = await sb
    .from('promo_shots')
    .update({ status: 'cancelled' })
    .eq('series_id', seriesId)
    .eq('user_id', user.id)
    .eq('status', 'queued')
  if (error) return { ok: false, error: 'failed' }

  await settleSeries(seriesId)
  const row = await fetchSeries(seriesId, user.id)
  if (row === null) return { ok: false, error: 'notFound' }
  return { ok: true, data: toSeriesView(row) }
}

/**
 * Повтор упавшего кадра (спека 5.4): бесплатен для человека до третьей
 * попытки (деньги за провал уже вернулись в POST /api/promo/shot), захват
 * атомарный тем же приёмом «update ... where status=... returning».
 */
export async function retryPromoShotAction(shotId: string): Promise<ActionResult<PromoShotView>> {
  if (!idSchema.safeParse(shotId).success) return { ok: false, error: 'invalid' }
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'anonymous' }
  if (!isSupabaseServiceConfigured()) return { ok: false, error: 'unavailable' }

  // Атомарный захват: только один вызов (двойной клик по «Повторить») пройдёт
  // это условие, второй увидит status уже 'queued' и вернёт invalid.
  const sb = getSupabaseService()
  const { data, error } = await sb
    .from('promo_shots')
    .update({ status: 'queued', error: null })
    .eq('id', shotId)
    .eq('user_id', user.id)
    .eq('status', 'failed')
    .lt('retries', 3)
    .select(
      'id, series_id, project_id, user_id, kind_slug, ordinal, status, parent_shot_id, variant_no, edit_prompt, storage_path, width, height, provider, prompt, scene, error, retries',
    )
    .maybeSingle()
  if (error || !data) return { ok: false, error: 'invalid' }

  // Счётчик попыток растёт отдельным точечным update: гонки уже нет, строка
  // захвачена предыдущим update по условию status='failed' -> 'queued'.
  const nextRetries = data.retries + 1
  await sb.from('promo_shots').update({ retries: nextRetries }).eq('id', shotId)

  await settleSeries(data.series_id)
  const views = await shotsToViews([{ ...data, retries: nextRetries }])
  return { ok: true, data: views[0] as PromoShotView }
}

/**
 * Правка готового кадра (спека 6.4): новый кадр рядом, оригинал не трогаем.
 * Референсом для route handler'а идёт КОРНЕВОЙ кадр группы вариантов - тот
 * же, на который указывает parent_shot_id по построению.
 */
export async function editPromoShotAction(
  input: unknown,
): Promise<ActionResult<{ readonly seriesId: string; readonly shot: PromoShotView }>> {
  const parsed = editPromoShotSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const verdict = checkScene(parsed.data.instruction)
  if (!verdict.ok) return { ok: false, error: 'invalid' }

  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'anonymous' }
  if (!isSupabaseServiceConfigured()) return { ok: false, error: 'unavailable' }

  const source = await fetchShot(parsed.data.shotId, user.id)
  if (source === null || source.status !== 'done') return { ok: false, error: 'notFound' }

  const rootId = source.parent_shot_id ?? source.id
  const sb = getSupabaseService()
  const { data: siblings } = await sb
    .from('promo_shots')
    .select('variant_no')
    .or(`id.eq.${rootId},parent_shot_id.eq.${rootId}`)
    .eq('user_id', user.id)
  const nextVariantNo = 1 + Math.max(1, ...((siblings ?? []).map((s) => Number(s.variant_no))))

  const access = await getAiAccess()
  if (access.remaining < aiCost('promoShots', 1)) return { ok: false, error: insufficientReason(access) }

  const inserted = await insertEditShot({
    userId: user.id,
    projectId: source.project_id,
    walletRef: parsed.data.walletRef,
    rootShotId: rootId,
    nextVariantNo,
    editPrompt: verdict.scene,
  })
  if (inserted === null) return { ok: false, error: 'failed' }

  const views = await shotsToViews([inserted.shot])
  return { ok: true, data: { seriesId: inserted.series.id, shot: views[0] as PromoShotView } }
}

export type ReferenceAnalysisResult =
  | { readonly ok: true; readonly mock: true; readonly style: StyleAnalysis }
  | { readonly ok: true; readonly mock: false; readonly style: StyleAnalysis; readonly remaining: number }
  | { readonly ok: false; readonly error: AiDenyReason | 'invalid' | 'failed' | 'blocked' | 'rateLimited' }

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
 * Не входит в job-путь: разбор ничего не рисует и не сохраняет байты,
 * поэтому остаётся обычным синхронным действием, как и раньше.
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
 * Мокапы мерча через Printful Mockup Generator. Не тронуто P0-3..P0-9:
 * мокапы Printful рисует сам, байты у нас не задерживаются, персистить нечего.
 */
export async function createMerchMockupsAction(input: unknown): Promise<MerchResult> {
  const parsed = merchSchema.safeParse(input)
  if (!parsed.success) return { printful: isPrintfulConfigured(), error: 'invalid' }

  // Гейт смотрит на Printful, а не на ключи Gemini/fal (P0-блокер ревью
  // 14.08.2026): isAiDemoMode() отвечает только за рисовалку, и конфигурация
  // «есть PRINTFUL_*, нет GEMINI_API_KEY и FAL_KEY» раньше пропускала живые
  // вызовы Printful вовсе без гейта Pro/аккаунта, под одним лишь IP-лимитом.
  if (isPrintfulConfigured()) {
    const grant = await assertAiAllowed('merchMockups')
    if (!grant.ok) return { printful: false, denied: grant.reason }
  }

  const products = [...new Set(parsed.data.products)]

  const printful = isPrintfulConfigured()
  if (!printful) return { printful: false }

  if (!(await passRateLimit())) return { printful, error: 'rateLimited' }

  const user = await getCurrentUser()
  const uploaded = await uploadArtwork(user?.id ?? 'anon', payload(parsed.data.boardPng).data)
  if (uploaded === null) return { printful, error: 'storage' }

  const auth: PrintfulAuth = { apiKey: PRINTFUL_API_KEY, storeId: PRINTFUL_STORE_ID }
  try {
    const outcomes = await Promise.all(products.map((id) => generateMockup(id, uploaded.url, auth, fetch, sleep)))
    const mockups = outcomes.flatMap((outcome): MerchMockup[] => (outcome.ok ? [outcome.value] : []))
    if (mockups.length > 0) return { printful, mockups }
    const first = outcomes.find((outcome) => !outcome.ok)
    return { printful, error: first === undefined || first.ok ? 'failed' : merchErrorFrom(first.error) }
  } finally {
    await removeArtwork(uploaded.path)
  }
}

// Явный ре-экспорт для читателей, которые ищут тип кадра/серии рядом с действиями.
export type { PromoSeriesView, PromoShotView }

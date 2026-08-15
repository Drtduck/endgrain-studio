import { assertAiAllowed, isAiDemoMode, releaseAiQuota } from '@/lib/ai/entitlements'
import type { AiFeature } from '@/lib/ai/quota'
import { resolveImageProvider } from '@/lib/ai/providers'
import { downloadPromoAsset, shotAssetPath, uploadPromoAsset } from '@/lib/promo/assets'
import { composePrompt, editPrompt } from '@/lib/promo/prompts'
import { fetchSeries, fetchShot, settleSeries, shotsToViews, toSeriesView, type ShotRow } from '@/lib/promo/db'
import { idSchema } from '@/lib/promo/schema'
import { shotSpendRef } from '@/lib/promo/spendRef'
import { getSupabaseService, isSupabaseServiceConfigured } from '@/lib/supabase/service'
import { getCurrentUser } from '@/lib/supabase/session'

/**
 * Рисует ОДИН кадр (P0-3, спека раздел 4.5-4.6). Route handler, а не server
 * action, по двум причинам: (1) свой maxDuration, не унаследованный от
 * страницы; (2) действие идемпотентно по shotId, и повторный вызов на уже
 * готовый кадр обязан вернуть тот же результат, не потратив ни цента.
 *
 * 30-секундный таймаут провайдера с двукратным запасом укладывается в
 * maxDuration=60: один кадр - один HTTP-запрос, обрыв платформы посреди
 * рисования не случится никогда.
 */
export const maxDuration = 60
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Ширина/высота из заголовка IHDR: 4 байта big-endian на смещениях 16 и 20. */
function pngDimensions(buffer: Buffer): { readonly width: number | null; readonly height: number | null } {
  if (buffer.length < 24 || buffer.readUInt32BE(0) !== 0x89504e47) return { width: null, height: null }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

function bad(status: number, body: Record<string, unknown> = {}): Response {
  return Response.json(body, { status })
}

export async function POST(req: Request): Promise<Response> {
  if (!isSupabaseServiceConfigured()) return bad(503, { error: 'unavailable' })

  const user = await getCurrentUser()
  if (!user) return bad(401, { error: 'unauthenticated' })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return bad(400, { error: 'invalid' })
  }
  const parsedId = idSchema.safeParse((body as { shotId?: unknown } | null)?.shotId)
  if (!parsedId.success) return bad(400, { error: 'invalid' })
  const shotId = parsedId.data

  const sb = getSupabaseService()

  // Атомарный захват (спека 4.6, п.3): пустой returning значит, что кадр уже
  // взят/готов/чужой - это и есть защита от двойного списания при двойном
  // клике. В этом случае просто отдаём текущее состояние, не трогая деньги.
  const { data: claimed } = await sb
    .from('promo_shots')
    .update({ status: 'running' })
    .eq('id', shotId)
    .eq('user_id', user.id)
    .eq('status', 'queued')
    .select(
      'id, series_id, project_id, user_id, kind_slug, ordinal, status, parent_shot_id, variant_no, edit_prompt, storage_path, width, height, provider, prompt, scene, error, retries',
    )
    .maybeSingle()

  if (claimed === null || claimed === undefined) {
    const current = await fetchShot(shotId, user.id)
    if (current === null) return bad(404, { error: 'notFound' })
    const series = await fetchSeries(current.series_id, user.id)
    const [shotView] = await shotsToViews([current])
    return Response.json({ shot: shotView, series: series ? toSeriesView(series) : null })
  }
  const shot = claimed as ShotRow

  const series = await fetchSeries(shot.series_id, user.id)
  if (series === null) return bad(404, { error: 'notFound' })

  const feature: AiFeature = series.source === 'reference' ? 'referenceShots' : 'promoShots'
  // Номер попытки в ref (P0-блокер ревью 14.08.2026): без него ref «Повторить»
  // байт в байт совпадал с рефом первой попытки, и consume_ai_units трактовал
  // настоящую перерисовку как replay честного двойного клика - кадр выходил
  // бесплатным. См. lib/promo/spendRef.ts.
  const ref = shotSpendRef(series.wallet_ref, shot.id, shot.retries)

  // Демо-режим (нет ни одного ключа провайдера): бесплатно, деньги/кадры не
  // трогаем вовсе, ровно как раньше делал старый generatePromoShotsAction.
  const demo = isAiDemoMode()
  const grant = demo ? null : await assertAiAllowed(feature, 1, ref)

  async function fail(status: ShotRow['status'], error: string): Promise<Response> {
    await sb.from('promo_shots').update({ status, error: error.slice(0, 200) }).eq('id', shot.id)
    if (grant !== null && grant.ok) await releaseAiQuota(grant)
    await settleSeries(series!.id)
    const failedShot = await fetchShot(shot.id, user!.id)
    const freshSeries = await fetchSeries(series!.id, user!.id)
    const [shotView] = await shotsToViews(failedShot ? [failedShot] : [])
    return Response.json({ shot: shotView ?? null, series: freshSeries ? toSeriesView(freshSeries) : null })
  }

  if (grant !== null && !grant.ok) return fail('failed', grant.reason)

  // Запоминаем на строке кадра, ЧЕМ именно он оплачен: reaper (P0-блокер
  // ревью 14.08.2026) обязан возвращать деньги/кадры/пробные попытки тем же
  // способом, каким они были списаны, а не угадывать тир жёстко зашитым
  // значением - иначе брошенный кадр, оплаченный пробным тиром, не вернётся
  // никогда (у consume_free_trial нет ledger со строкой для release_ai_units).
  if (grant !== null && grant.ok) {
    if (grant.tier === 'trial') {
      await sb.from('promo_shots').update({ paid_tier: 'trial', trial_subjects: grant.subjects }).eq('id', shot.id)
    } else {
      await sb.from('promo_shots').update({ paid_tier: grant.tier, paid_period: grant.period, paid_ref: grant.ref }).eq('id', shot.id)
    }
  }

  // Референс: для правки кадра (source='edit') это сам исправляемый кадр
  // (parent_shot_id - всегда корень группы вариантов), иначе - рендер доски,
  // сохранённый в момент создания серии.
  let referenceBytes: Buffer | null = null
  let promptText: string
  if (series.source === 'edit') {
    const rootId = shot.parent_shot_id
    if (rootId === null) return fail('failed', 'noReference')
    const rootShot = await fetchShot(rootId, user.id)
    if (rootShot === null || rootShot.storage_path === null) return fail('failed', 'noReference')
    referenceBytes = await downloadPromoAsset(rootShot.storage_path)
    promptText = editPrompt(shot.edit_prompt ?? '', series.board_desc ?? '')
  } else {
    if (series.board_png_path !== null) referenceBytes = await downloadPromoAsset(series.board_png_path)
    promptText = composePrompt(shot.scene ?? '', series.board_desc ?? '')
  }
  if (referenceBytes === null && !demo) return fail('failed', 'noReference')

  const tier = grant !== null && grant.ok && grant.tier === 'trial' ? 'cheap' : 'good'
  const provider = resolveImageProvider(tier)
  if (provider === null) return fail('failed', 'unavailable')

  const outcome = await provider.generate({
    prompt: promptText,
    ...(referenceBytes !== null ? { referencePngBase64: referenceBytes.toString('base64') } : {}),
  })

  if (outcome.kind === 'blocked') return fail('blocked', 'blocked')
  if (outcome.kind === 'failed') return fail('failed', 'failed')

  // outcome.kind === 'image'
  const comma = outcome.dataUrl.indexOf(',')
  const base64 = comma >= 0 ? outcome.dataUrl.slice(comma + 1) : outcome.dataUrl
  const buffer = Buffer.from(base64, 'base64')
  const path = shotAssetPath(user.id, series.id, shot.id)
  const uploaded = await uploadPromoAsset(path, base64)
  if (uploaded === null) return fail('failed', 'storage')

  const { width, height } = pngDimensions(buffer)
  await sb
    .from('promo_shots')
    .update({
      status: 'done',
      storage_path: uploaded.path,
      width,
      height,
      bytes: uploaded.bytes,
      provider: outcome.provider,
      prompt: promptText,
    })
    .eq('id', shot.id)

  await settleSeries(series.id)
  const doneShot = await fetchShot(shot.id, user.id)
  const freshSeries = await fetchSeries(series.id, user.id)
  const [shotView] = await shotsToViews(doneShot ? [doneShot] : [])
  return Response.json({ shot: shotView ?? null, series: freshSeries ? toSeriesView(freshSeries) : null })
}

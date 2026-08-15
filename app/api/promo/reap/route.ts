import type { FreeSubject } from '@/lib/ai/freeSubjects'
import { releaseAiQuota, type AiGrant } from '@/lib/ai/entitlements'
import { settleSeries } from '@/lib/promo/db'
import { getSupabaseService, isSupabaseServiceConfigured } from '@/lib/supabase/service'

/**
 * Подбор брошенных кадров (спека 4.7, п.2): человек закрыл вкладку посреди
 * генерации, кадр остался в running/queued, деньги за running-кадр списаны.
 * Без этого хендлера закрытая вкладка - оплаченный ноль. Зовётся Vercel Cron
 * раз в 15 минут (vercel.json), защищён CRON_SECRET.
 *
 * running старше 5 минут - зависший кадр (провайдер должен был ответить за
 * 30 секунд с запасом), queued старше 30 минут - брошенная серия, до которой
 * runner так и не дошёл (закрытая вкладка).
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RUNNING_STALE_MS = 5 * 60_000
const QUEUED_STALE_MS = 30 * 60_000

interface RunningRow {
  readonly id: string
  readonly series_id: string
  readonly user_id: string
  readonly paid_tier: string | null
  readonly paid_period: string | null
  readonly paid_ref: string | null
  readonly trial_subjects: unknown
}

/**
 * Собирает AiGrant для releaseAiQuota из того, что POST /api/promo/shot
 * записал на строку кадра при захвате (см. миграцию 20260815160000). paid_tier
 * пуст в демо-режиме (ключей нет, платить не за что) - тогда возвращать нечего.
 */
function reapGrant(row: RunningRow): AiGrant | null {
  if (row.paid_tier === 'trial') {
    const subjects = Array.isArray(row.trial_subjects) ? (row.trial_subjects as readonly FreeSubject[]) : null
    if (subjects === null || subjects.length === 0) return null
    return { ok: true, tier: 'trial', subjects, cost: 1, remaining: 0 }
  }
  if (row.paid_tier === 'pro') {
    if (row.paid_period === null || row.paid_ref === null) return null
    return { ok: true, tier: 'pro', userId: row.user_id, period: row.paid_period, cost: 1, used: 0, remaining: 0, ref: row.paid_ref, free: 0, credits: 0 }
  }
  if (row.paid_tier === 'credits') {
    if (row.paid_period === null || row.paid_ref === null) return null
    return { ok: true, tier: 'credits', userId: row.user_id, period: row.paid_period, ref: row.paid_ref, cost: 1, free: 0, credits: 0, remaining: 0 }
  }
  return null
}

function authorized(req: Request): boolean {
  const secret = process.env['CRON_SECRET'] ?? ''
  if (secret.length === 0) return false
  const header = req.headers.get('authorization') ?? ''
  return header === `Bearer ${secret}`
}

export async function GET(req: Request): Promise<Response> {
  if (!authorized(req)) return Response.json({ error: 'unauthorized' }, { status: 401 })
  if (!isSupabaseServiceConfigured()) return Response.json({ error: 'unavailable' }, { status: 503 })

  const sb = getSupabaseService()
  const now = Date.now()

  const { data: stuckRunning } = await sb
    .from('promo_shots')
    .update({ status: 'failed', error: 'abandoned' })
    .eq('status', 'running')
    .lt('updated_at', new Date(now - RUNNING_STALE_MS).toISOString())
    .select('id, series_id, user_id, paid_tier, paid_period, paid_ref, trial_subjects')

  const { data: stuckQueued } = await sb
    .from('promo_shots')
    .update({ status: 'failed', error: 'abandoned' })
    .eq('status', 'queued')
    .lt('updated_at', new Date(now - QUEUED_STALE_MS).toISOString())
    .select('id, series_id')

  const runningRows = stuckRunning ?? []
  const queuedRows = stuckQueued ?? []

  // running-кадры уже были списаны при захвате (POST /api/promo/shot) -
  // деньги/кадры/пробные попытки возвращаем тем же приёмом, что и обычный
  // провал кадра. queued-кадры денег не тратили никогда (списание поштучное,
  // при захвате), возврата не требуют - им достаточно перестать быть queued.
  //
  // Тир читаем со строки кадра (paid_tier), а не угадываем жёстко зашитым
  // 'pro': кадр, оплаченный пробным тиром, вообще не имеет строки в
  // ai_credit_transactions, и release_ai_units для него ответил бы not_found,
  // а пробная попытка терялась бы навсегда молча (P0-блокер ревью 14.08.2026).
  for (const row of runningRows) {
    const grant = reapGrant(row as unknown as RunningRow)
    if (grant !== null) await releaseAiQuota(grant)
  }

  const affectedSeries = [...new Set([...runningRows, ...queuedRows].map((r) => String(r.series_id)))]
  for (const seriesId of affectedSeries) await settleSeries(seriesId)

  return Response.json({ ok: true, reapedRunning: runningRows.length, reapedQueued: queuedRows.length })
}

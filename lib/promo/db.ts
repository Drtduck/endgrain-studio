import 'server-only'
import { getSupabaseService, isSupabaseServiceConfigured } from '@/lib/supabase/service'
import { signPromoAssets } from './assets'
import type { PromoSeriesSource, PromoSeriesStatus, PromoSeriesView, PromoShotStatus, PromoShotView } from './types'

/**
 * Чтение/запись promo_series и promo_shots. Один файл, а не разбросано по
 * app/actions/promo.ts и app/api/promo/shot/route.ts: оба места работают с
 * одними и теми же строками и обязаны видеть одну и ту же форму данных.
 *
 * Пишет и читает всегда service-ключом с явным .eq('user_id', ...): RLS на
 * insert/update у promo_series/promo_shots нет намеренно (комментарий в
 * миграции), а select под RLS не даёт то же самое, что server action уже и
 * так проверил владение через сессию.
 */

interface SeriesRow {
  readonly id: string
  readonly project_id: string
  readonly user_id: string
  readonly source: string
  readonly status: string
  readonly requested: number
  readonly succeeded: number
  readonly failed: number
  readonly wallet_ref: string
  readonly board_desc: string | null
  readonly board_png_path: string | null
  readonly created_at: string
  readonly finished_at: string | null
}

interface ShotRow {
  readonly id: string
  readonly series_id: string
  readonly project_id: string
  readonly user_id: string
  readonly kind_slug: string
  readonly ordinal: number
  readonly status: string
  readonly parent_shot_id: string | null
  readonly variant_no: number
  readonly edit_prompt: string | null
  readonly storage_path: string | null
  readonly width: number | null
  readonly height: number | null
  readonly provider: string | null
  readonly prompt: string | null
  readonly scene: string | null
  readonly error: string | null
  readonly retries: number
}

export function toSeriesView(row: SeriesRow): PromoSeriesView {
  return {
    id: row.id,
    projectId: row.project_id,
    source: row.source as PromoSeriesSource,
    status: row.status as PromoSeriesStatus,
    requested: row.requested,
    succeeded: row.succeeded,
    failed: row.failed,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
  }
}

export function toShotView(row: ShotRow, url: string | null): PromoShotView {
  return {
    id: row.id,
    seriesId: row.series_id,
    kindSlug: row.kind_slug,
    ordinal: row.ordinal,
    status: row.status as PromoShotStatus,
    parentShotId: row.parent_shot_id,
    variantNo: row.variant_no,
    editPrompt: row.edit_prompt,
    url,
    width: row.width,
    height: row.height,
    provider: row.provider,
    prompt: row.prompt,
    error: row.error,
    retries: row.retries,
  }
}

const SHOT_COLUMNS =
  'id, series_id, project_id, user_id, kind_slug, ordinal, status, parent_shot_id, variant_no, edit_prompt, storage_path, width, height, provider, prompt, scene, error, retries'
const SERIES_COLUMNS =
  'id, project_id, user_id, source, status, requested, succeeded, failed, wallet_ref, board_desc, board_png_path, created_at, finished_at'

/** Подписывает готовые кадры signed URL пачкой и собирает PromoShotView[]. */
export async function shotsToViews(rows: readonly ShotRow[]): Promise<readonly PromoShotView[]> {
  const paths = rows.flatMap((r) => (r.storage_path ? [r.storage_path] : []))
  const urls = await signPromoAssets(paths)
  return rows.map((row) => toShotView(row, row.storage_path ? (urls.get(row.storage_path) ?? null) : null))
}

export async function fetchSeriesShots(seriesId: string, userId: string): Promise<readonly ShotRow[]> {
  if (!isSupabaseServiceConfigured()) return []
  const sb = getSupabaseService()
  const { data, error } = await sb
    .from('promo_shots')
    .select(SHOT_COLUMNS)
    .eq('series_id', seriesId)
    .eq('user_id', userId)
    .order('ordinal', { ascending: true })
    .order('variant_no', { ascending: true })
  if (error || !data) return []
  return data as unknown as ShotRow[]
}

export async function fetchSeries(seriesId: string, userId: string): Promise<SeriesRow | null> {
  if (!isSupabaseServiceConfigured()) return null
  const sb = getSupabaseService()
  const { data, error } = await sb
    .from('promo_series')
    .select(SERIES_COLUMNS)
    .eq('id', seriesId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) return null
  return data as unknown as SeriesRow
}

export async function fetchShot(shotId: string, userId: string): Promise<ShotRow | null> {
  if (!isSupabaseServiceConfigured()) return null
  const sb = getSupabaseService()
  const { data, error } = await sb
    .from('promo_shots')
    .select(SHOT_COLUMNS)
    .eq('id', shotId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) return null
  return data as unknown as ShotRow
}

export async function listProjectSeries(
  projectId: string,
  userId: string,
): Promise<{ readonly series: readonly SeriesRow[]; readonly shots: readonly ShotRow[] }> {
  if (!isSupabaseServiceConfigured()) return { series: [], shots: [] }
  const sb = getSupabaseService()
  const { data: seriesData, error: seriesError } = await sb
    .from('promo_series')
    .select(SERIES_COLUMNS)
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (seriesError || !seriesData) return { series: [], shots: [] }
  const series = seriesData as unknown as SeriesRow[]
  if (series.length === 0) return { series: [], shots: [] }
  const { data: shotsData, error: shotsError } = await sb
    .from('promo_shots')
    .select(SHOT_COLUMNS)
    .in(
      'series_id',
      series.map((s) => s.id),
    )
    .order('ordinal', { ascending: true })
    .order('variant_no', { ascending: true })
  const shots = shotsError || !shotsData ? [] : (shotsData as unknown as ShotRow[])
  return { series, shots }
}

/** Брошенные серии (спека 4.7, п.1): подхватываются заново при открытии вкладки. */
export async function listActiveSeries(
  userId: string,
): Promise<{ readonly series: readonly SeriesRow[]; readonly shots: readonly ShotRow[] }> {
  if (!isSupabaseServiceConfigured()) return { series: [], shots: [] }
  const sb = getSupabaseService()
  const sinceIso = new Date(Date.now() - 60 * 60_000).toISOString()
  const { data: seriesData, error: seriesError } = await sb
    .from('promo_series')
    .select(SERIES_COLUMNS)
    .eq('user_id', userId)
    .in('status', ['queued', 'running'])
    .gte('updated_at', sinceIso)
    .order('updated_at', { ascending: false })
    .limit(20)
  if (seriesError || !seriesData) return { series: [], shots: [] }
  const series = seriesData as unknown as SeriesRow[]
  if (series.length === 0) return { series: [], shots: [] }
  const { data: shotsData, error: shotsError } = await sb
    .from('promo_shots')
    .select(SHOT_COLUMNS)
    .in(
      'series_id',
      series.map((s) => s.id),
    )
    .order('ordinal', { ascending: true })
  const shots = shotsError || !shotsData ? [] : (shotsData as unknown as ShotRow[])
  return { series, shots }
}

export interface NewShot {
  readonly ordinal: number
  readonly kindSlug: string
  readonly scene: string
}

/** Заводит серию и её кадры одной операцией. Возвращает null при ошибке записи. */
export async function insertSeries(input: {
  readonly userId: string
  readonly projectId: string
  readonly source: PromoSeriesSource
  readonly walletRef: string
  readonly boardDesc: string
  readonly boardPngPath: string
  readonly shots: readonly NewShot[]
}): Promise<{ readonly series: SeriesRow; readonly shots: readonly ShotRow[] } | null> {
  if (!isSupabaseServiceConfigured()) return null
  const sb = getSupabaseService()
  const { data: seriesData, error: seriesError } = await sb
    .from('promo_series')
    .insert({
      user_id: input.userId,
      project_id: input.projectId,
      source: input.source,
      status: 'queued',
      requested: input.shots.length,
      wallet_ref: input.walletRef,
      board_desc: input.boardDesc,
      board_png_path: input.boardPngPath,
    })
    .select(SERIES_COLUMNS)
    .single()
  if (seriesError || !seriesData) {
    console.error('[promo] insertSeries failed', seriesError?.message)
    return null
  }
  const series = seriesData as unknown as SeriesRow

  const { data: shotsData, error: shotsError } = await sb
    .from('promo_shots')
    .insert(
      input.shots.map((shot) => ({
        series_id: series.id,
        user_id: input.userId,
        project_id: input.projectId,
        kind_slug: shot.kindSlug,
        ordinal: shot.ordinal,
        status: 'queued',
        scene: shot.scene,
      })),
    )
    .select(SHOT_COLUMNS)
  if (shotsError || !shotsData) {
    console.error('[promo] insertShots failed', shotsError?.message)
    // Кадры не встали - серия без единого кадра бессмысленна, убираем её же.
    await sb.from('promo_series').delete().eq('id', series.id)
    return null
  }
  return { series, shots: shotsData as unknown as ShotRow[] }
}

/**
 * Правка кадра (спека 6.4): новая серия из одного кадра, source='edit',
 * parent_shot_id указывает на корень группы вариантов.
 */
export async function insertEditShot(input: {
  readonly userId: string
  readonly projectId: string
  readonly walletRef: string
  readonly rootShotId: string
  readonly nextVariantNo: number
  readonly editPrompt: string
}): Promise<{ readonly series: SeriesRow; readonly shot: ShotRow } | null> {
  if (!isSupabaseServiceConfigured()) return null
  const sb = getSupabaseService()
  const { data: seriesData, error: seriesError } = await sb
    .from('promo_series')
    .insert({
      user_id: input.userId,
      project_id: input.projectId,
      source: 'edit',
      status: 'queued',
      requested: 1,
      wallet_ref: input.walletRef,
    })
    .select(SERIES_COLUMNS)
    .single()
  if (seriesError || !seriesData) return null
  const series = seriesData as unknown as SeriesRow

  const { data: shotData, error: shotError } = await sb
    .from('promo_shots')
    .insert({
      series_id: series.id,
      user_id: input.userId,
      project_id: input.projectId,
      kind_slug: 'edit',
      ordinal: 0,
      status: 'queued',
      parent_shot_id: input.rootShotId,
      variant_no: input.nextVariantNo,
      edit_prompt: input.editPrompt,
    })
    .select(SHOT_COLUMNS)
    .single()
  if (shotError || !shotData) {
    await sb.from('promo_series').delete().eq('id', series.id)
    return null
  }
  return { series, shot: shotData as unknown as ShotRow }
}

/** Пересчёт серии одним вызовом SQL-функции (миграция 20260815140000). */
export async function settleSeries(seriesId: string): Promise<{ readonly status: string } | null> {
  if (!isSupabaseServiceConfigured()) return null
  const sb = getSupabaseService()
  const { data, error } = await sb.rpc('settle_promo_series', { p_series_id: seriesId })
  if (error) {
    console.error('[promo] settle_promo_series failed', error.message)
    return null
  }
  return data as { readonly status: string } | null
}

export type { SeriesRow, ShotRow }

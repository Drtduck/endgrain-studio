import 'server-only'
import { getSupabaseService, isSupabaseServiceConfigured } from '@/lib/supabase/service'

/**
 * Приватный bucket с оплаченными кадрами (миграция 20260815130000_promo_assets.sql).
 * В отличие от promo-mockups (публичный, живёт секунды под Printful) этот
 * bucket хранит результат месяцами и отдаётся исключительно через signed URL.
 */
export const PROMO_ASSETS_BUCKET = 'promo-assets'

/** Час: столько живёт ссылка, отдаваемая клиенту вместе с карточкой кадра. */
export const PROMO_ASSETS_SIGNED_URL_TTL_SEC = 3600

/** Путь кадра: {userId}/{seriesId}/{shotId}.png - первый сегмент держит вся RLS-политика bucket'а. */
export function shotAssetPath(userId: string, seriesId: string, shotId: string): string {
  return `${userId}/${seriesId}/${shotId}.png`
}

/** Путь рендера доски серии: тот же префикс, отдельное имя, чтобы не путать со снимками кадров. */
export function boardAssetPath(userId: string, seriesId: string): string {
  return `${userId}/${seriesId}/board.png`
}

export interface UploadedAsset {
  readonly path: string
  readonly bytes: number
}

/** Кладёт PNG в приватный bucket под service-ключом: RLS на insert для клиента нет намеренно. */
export async function uploadPromoAsset(path: string, base64: string): Promise<UploadedAsset | null> {
  if (!isSupabaseServiceConfigured()) return null
  try {
    const buffer = Buffer.from(base64, 'base64')
    const sb = getSupabaseService()
    const { error } = await sb.storage
      .from(PROMO_ASSETS_BUCKET)
      .upload(path, buffer, { contentType: 'image/png', upsert: true })
    if (error) {
      console.error('[promo] asset upload failed', error.message)
      return null
    }
    return { path, bytes: buffer.byteLength }
  } catch (err) {
    console.error('[promo] asset upload error', err)
    return null
  }
}

/** Signed URL на час: отдача приватного bucket'а клиенту (спека 2.1). */
export async function signPromoAsset(path: string): Promise<string | null> {
  if (!isSupabaseServiceConfigured()) return null
  try {
    const sb = getSupabaseService()
    const { data, error } = await sb.storage
      .from(PROMO_ASSETS_BUCKET)
      .createSignedUrl(path, PROMO_ASSETS_SIGNED_URL_TTL_SEC)
    if (error || !data?.signedUrl) return null
    return data.signedUrl
  } catch (err) {
    console.error('[promo] asset sign error', err)
    return null
  }
}

/**
 * Signed URL пачкой: карточек в галерее много, а createSignedUrl по одной -
 * это N запросов к Storage на каждое открытие вкладки. createSignedUrls берёт
 * все пути одним вызовом.
 */
export async function signPromoAssets(
  paths: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  const result = new Map<string, string>()
  if (paths.length === 0 || !isSupabaseServiceConfigured()) return result
  try {
    const sb = getSupabaseService()
    const { data, error } = await sb.storage
      .from(PROMO_ASSETS_BUCKET)
      .createSignedUrls([...paths], PROMO_ASSETS_SIGNED_URL_TTL_SEC)
    if (error || !data) return result
    for (const row of data) {
      if (row.signedUrl && row.path) result.set(row.path, row.signedUrl)
    }
    return result
  } catch (err) {
    console.error('[promo] batch asset sign error', err)
    return result
  }
}

/** Байты рендера доски: читает route handler, чтобы не доверять клиенту повторно на каждый кадр. */
export async function downloadPromoAsset(path: string): Promise<Buffer | null> {
  if (!isSupabaseServiceConfigured()) return null
  try {
    const sb = getSupabaseService()
    const { data, error } = await sb.storage.from(PROMO_ASSETS_BUCKET).download(path)
    if (error || !data) return null
    return Buffer.from(await data.arrayBuffer())
  } catch (err) {
    console.error('[promo] asset download error', err)
    return null
  }
}

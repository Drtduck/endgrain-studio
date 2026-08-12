import 'server-only'
import { getSupabaseService, isSupabaseServiceConfigured } from '@/lib/supabase/service'

/**
 * Временный хостинг макета под Printful. Генератор мокапов тянет файл со своей
 * стороны обычным GET и data:URI не принимает, поэтому рендер доски обязан на
 * несколько секунд оказаться в интернете по публичному https-адресу.
 *
 * Отсюда весь жизненный цикл объекта: положили, дали ссылку Printful, забрали
 * мокапы, удалили. Файл не переживает запрос, а хвосты после падения процесса
 * подчищает purge_promo_mockups из той же миграции.
 */

/** Публичный bucket, заведён миграцией 20260812150000_promo_mockups_bucket.sql. */
export const PROMO_MOCKUPS_BUCKET = 'promo-mockups'

/** Сколько живёт забытый объект, прежде чем его снесёт уборка. */
export const PROMO_MOCKUPS_TTL_MINUTES = 60

export interface UploadedArtwork {
  readonly path: string
  readonly url: string
}

/**
 * Имя объекта: префикс пользователя и случайный хвост. Случайность важна не
 * ради красоты - bucket публичный на чтение, и предсказуемое имя дало бы чужому
 * возможность подсмотреть макет, пока тот живёт свои несколько секунд.
 */
export function artworkPath(userId: string, random: string): string {
  const safeUser = userId.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64) || 'anon'
  return `${safeUser}/${Date.now()}-${random}.png`
}

/** Кладёт PNG в публичный bucket и возвращает путь вместе с адресом для Printful. */
export async function uploadArtwork(userId: string, base64: string): Promise<UploadedArtwork | null> {
  if (!isSupabaseServiceConfigured()) return null
  try {
    const sb = getSupabaseService()
    const path = artworkPath(userId, crypto.randomUUID().slice(0, 12))
    const storage = sb.storage.from(PROMO_MOCKUPS_BUCKET)
    const { error } = await storage.upload(path, Buffer.from(base64, 'base64'), {
      contentType: 'image/png',
      upsert: false,
    })
    if (error) {
      console.error('[promo] artwork upload failed', error.message)
      return null
    }
    const { data } = storage.getPublicUrl(path)
    if (!data.publicUrl) return null
    return { path, url: data.publicUrl }
  } catch (err) {
    console.error('[promo] artwork upload error', err)
    return null
  }
}

/** Сколько объектов проверяем за один проход уборки: у одного человека их единицы. */
const PURGE_PAGE = 100

/**
 * Убирает за собой: свой объект точно, забытые прежними запросами по возможности.
 *
 * Уборка идёт через Storage API, а не через delete в SQL: Supabase такой delete
 * запрещает даже под service-ключом (42501 «Direct deletion from storage tables
 * is not allowed»), проверено на живом проекте. Поэтому list по своему префиксу
 * и remove пачкой - объектов у одного человека единицы, страницы хватает.
 *
 * Всё best-effort: ответ пользователю от уборки не зависит, а мусор в bucket
 * это счёт за хранение, а не сломанная функция.
 */
export async function removeArtwork(path: string): Promise<void> {
  if (!isSupabaseServiceConfigured()) return
  const prefix = path.split('/')[0] ?? ''
  try {
    const storage = getSupabaseService().storage.from(PROMO_MOCKUPS_BUCKET)
    await storage.remove([path])

    // Хвосты от запросов, которые не дожили до этой строки: таймаут инстанса,
    // деплой посреди поллинга, упавший Printful.
    if (prefix === '') return
    const { data, error } = await storage.list(prefix, { limit: PURGE_PAGE })
    if (error || !data) return
    const deadline = Date.now() - PROMO_MOCKUPS_TTL_MINUTES * 60_000
    const stale = data
      .filter((item) => Date.parse(item.created_at ?? '') < deadline)
      .map((item) => `${prefix}/${item.name}`)
    if (stale.length > 0) await storage.remove(stale)
  } catch (err) {
    console.error('[promo] artwork cleanup error', err)
  }
}

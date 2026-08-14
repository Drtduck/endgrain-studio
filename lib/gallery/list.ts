import 'server-only'
import type { Design } from '@/lib/engine'
import { parseDesign } from '@/lib/persist'
import { getProfiles } from '@/lib/profile/read'
import type { PublicProfile } from '@/lib/profile/types'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { getSupabaseServer } from '@/lib/supabase/server'
import type { PublishedProjectRow } from '@/lib/supabase/types'
import { parseSummary } from './summary'
import { GALLERY_PAGE_SIZE, type GalleryCard, type GalleryPage, type GallerySort } from './types'
import { galleryOffset } from './query'

// design здесь сознательно не читается: колонка закрыта column-grant'ом в
// published_projects (миграция 20260813100000) от anon и authenticated, обычный
// select design через этот же клиент просто не вернул бы значение. Карточке
// summary хватает; полный design - через getPublishedProjectDesign ниже.
const CARD_COLUMNS = 'id, author_id, title, price_cents, currency, likes_count, saves_count, status, summary, created_at'

interface CardRow {
  readonly id: unknown
  readonly author_id: unknown
  readonly title: unknown
  readonly price_cents: unknown
  readonly currency: unknown
  readonly likes_count: unknown
  readonly saves_count: unknown
  readonly status: unknown
  readonly summary: unknown
  readonly created_at: unknown
}

/**
 * Битая строка (не проходит parseSummary) молча выпадает из ленты, а не
 * роняет всю страницу: одна испорченная публикация не должна положить
 * галерею целиком.
 */
function toCard(row: CardRow, profiles: ReadonlyMap<string, PublicProfile>): GalleryCard | null {
  const summary = parseSummary(row.summary)
  if (summary === null) return null
  const authorId = String(row.author_id)
  const profile = profiles.get(authorId)
  return {
    id: String(row.id),
    authorId,
    title: String(row.title),
    priceCents: Number(row.price_cents),
    currency: String(row.currency),
    likesCount: Number(row.likes_count),
    savesCount: Number(row.saves_count),
    status: row.status as GalleryCard['status'],
    summary,
    createdAt: String(row.created_at),
    author: { id: authorId, displayName: profile?.displayName ?? null, avatarUrl: profile?.avatarUrl ?? null },
  }
}

/**
 * Список галереи для SSR-страницы. Без настроенного Supabase (например,
 * локально без ключей) галерея честно показывает пустое состояние, а не 500:
 * тот же принцип деградации, что и во всей студии без ключей.
 */
export async function listGallery(sort: GallerySort, page: number): Promise<GalleryPage> {
  if (!isSupabaseConfigured()) return { items: [], page, sort, hasMore: false }

  try {
    const sb = await getSupabaseServer()
    const offset = galleryOffset(page)
    // Забираем на одну строку больше запрошенного лимита: наличие лишней строки
    // и есть honest hasMore, без отдельного count-запроса.
    const query = sb.from('published_projects').select(CARD_COLUMNS).eq('status', 'public').range(offset, offset + GALLERY_PAGE_SIZE)

    const { data, error } =
      sort === 'popular'
        ? await query.order('likes_count', { ascending: false }).order('created_at', { ascending: false }).order('id', { ascending: false })
        : await query.order('created_at', { ascending: false }).order('id', { ascending: false })

    if (error || !data) return { items: [], page, sort, hasMore: false }

    const hasMore = data.length > GALLERY_PAGE_SIZE
    const rows = data.slice(0, GALLERY_PAGE_SIZE) as unknown as CardRow[]
    const profiles = await getProfiles(rows.map((row) => String(row.author_id)))
    const items = rows.flatMap((row) => {
      const card = toCard(row, profiles)
      return card === null ? [] : [card]
    })

    return { items, page, sort, hasMore }
  } catch (err) {
    console.error('listGallery failed', err)
    return { items: [], page, sort, hasMore: false }
  }
}

const PROJECT_COLUMNS =
  'id, author_id, source_project_id, title, summary, price_cents, currency, likes_count, saves_count, status, created_at, updated_at'

/**
 * Запись публикации без design (страница проекта, витрина). design не входит
 * в select('*') - явный список колонок и без него, потому что колонка закрыта
 * column-grant'ом (см. миграцию 20260813100000): select('*') по нему просто
 * молча вернул бы строку без этого поля, явный список читается яснее.
 */
export async function getPublishedProject(id: string): Promise<PublishedProjectRow | null> {
  if (!isSupabaseConfigured()) return null
  try {
    const sb = await getSupabaseServer()
    const { data, error } = await sb.from('published_projects').select(PROJECT_COLUMNS).eq('id', id).maybeSingle()
    if (error || !data) return null
    return data as unknown as PublishedProjectRow
  } catch (err) {
    console.error('getPublishedProject failed', err)
    return null
  }
}

/**
 * Полный design публикации: единственный путь - security definer функция
 * published_project_design (та же миграция), которая сама проверяет
 * price_cents = 0, авторство или оплаченную покупку и возвращает null иначе.
 * Здесь только парсинг снапшота, чтобы битый JSON не уронил страницу.
 */
export async function getPublishedProjectDesign(id: string): Promise<Design | null> {
  if (!isSupabaseConfigured()) return null
  try {
    const sb = await getSupabaseServer()
    const { data, error } = await sb.rpc('published_project_design', { p_id: id })
    if (error || data === null || data === undefined) return null
    return parseDesign(data)
  } catch (err) {
    console.error('getPublishedProjectDesign failed', err)
    return null
  }
}

/** Лайкнул ли текущий пользователь эту публикацию: под своей RLS-политикой select. */
export async function hasLiked(userId: string, publishedId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false
  try {
    const sb = await getSupabaseServer()
    const { data } = await sb
      .from('project_likes')
      .select('published_id')
      .eq('published_id', publishedId)
      .eq('user_id', userId)
      .maybeSingle()
    return data !== null
  } catch (err) {
    console.error('hasLiked failed', err)
    return false
  }
}

/** Купил ли текущий пользователь эту публикацию: под своей RLS-политикой select (purchases_select_buyer). */
export async function hasPurchased(userId: string, publishedId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false
  try {
    const sb = await getSupabaseServer()
    const { data } = await sb
      .from('project_purchases')
      .select('id')
      .eq('published_id', publishedId)
      .eq('buyer_id', userId)
      .eq('status', 'paid')
      .maybeSingle()
    return data !== null
  } catch (err) {
    console.error('hasPurchased failed', err)
    return false
  }
}

/** «Мои публикации»: собственные строки автора вне зависимости от статуса. */
export async function listMyPublished(userId: string): Promise<readonly GalleryCard[]> {
  if (!isSupabaseConfigured()) return []
  try {
    const sb = await getSupabaseServer()
    const { data, error } = await sb
      .from('published_projects')
      .select(CARD_COLUMNS)
      .eq('author_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error || !data) return []
    const rows = data as unknown as CardRow[]
    // Все строки одного автора: userId уже известен, батч-чтение профиля не нужно.
    const profiles = await getProfiles([userId])
    return rows.flatMap((row) => {
      const card = toCard(row, profiles)
      return card === null ? [] : [card]
    })
  } catch (err) {
    console.error('listMyPublished failed', err)
    return []
  }
}

/**
 * Публичные публикации одного автора, для /u/[id]. По образцу listMyPublished
 * выше, но фильтр по status='public' (не все свои, как в панели проектов) и
 * без RLS-обхода: тот же user-context клиент, что и listGallery, потому что
 * анонимный посетитель обязан видеть эту сетку без входа.
 */
export async function listByAuthorPublic(userId: string): Promise<readonly GalleryCard[]> {
  if (!isSupabaseConfigured()) return []
  try {
    const sb = await getSupabaseServer()
    const { data, error } = await sb
      .from('published_projects')
      .select(CARD_COLUMNS)
      .eq('author_id', userId)
      .eq('status', 'public')
      .order('created_at', { ascending: false })
      .limit(50)
    if (error || !data) return []
    const rows = data as unknown as CardRow[]
    const profiles = await getProfiles([userId])
    return rows.flatMap((row) => {
      const card = toCard(row, profiles)
      return card === null ? [] : [card]
    })
  } catch (err) {
    console.error('listByAuthorPublic failed', err)
    return []
  }
}

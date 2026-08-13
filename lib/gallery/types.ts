/**
 * Чистые типы галереи. GalleryCard больше не несёт design: колонка design
 * закрыта column-grant'ом в published_projects (см. миграцию 20260813100000)
 * от anon и authenticated целиком, а список карточек читается тем же
 * user-context клиентом, что и всё остальное. Карточке хватает summary для
 * превью-плейсхолдера; полный design достаётся только через серверную
 * функцию published_project_design (lib/gallery/list.ts:getPublishedProjectDesign),
 * с проверкой price_cents = 0, авторства или покупки.
 */

export type GallerySort = 'new' | 'popular'

export const GALLERY_SORTS: readonly GallerySort[] = ['new', 'popular']

/** Карточек на страницу и жёсткий потолок страниц: см. спеку про offset-пагинацию. */
export const GALLERY_PAGE_SIZE = 12
export const GALLERY_MAX_PAGE = 10

/** Выше стольки ячеек карточка рисует упрощённый плейсхолдер, а не полный SVG. */
export const GALLERY_CELL_LIMIT = 2000

export type GalleryError = 'unauthenticated' | 'invalid' | 'notFound' | 'failed' | 'limit' | 'needsPurchase'

export interface GallerySummary {
  readonly widthMm: number
  readonly lengthMm: number
  readonly thicknessMm: number
  readonly cellCount: number
  /** Id пород по убыванию доли, как в lib/species. */
  readonly species: readonly string[]
}

export interface GalleryCard {
  readonly id: string
  readonly authorId: string
  readonly title: string
  readonly priceCents: number
  readonly currency: string
  readonly likesCount: number
  readonly savesCount: number
  readonly status: 'public' | 'unlisted' | 'removed'
  readonly summary: GallerySummary
  readonly createdAt: string
}

export interface GalleryPage {
  readonly items: readonly GalleryCard[]
  readonly page: number
  readonly sort: GallerySort
  readonly hasMore: boolean
}

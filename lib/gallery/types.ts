import type { Design } from '@/lib/engine'

/**
 * Чистые типы галереи. GalleryCard несёт design (нужен для SSR-превью SVG
 * прямо в серверном компоненте карточки), поэтому используется только на
 * сервере: клиентские компоненты (LikeButton, CopyToMyProjects) принимают
 * только id и то, что реально показывают в интерфейсе, а не весь снапшот.
 */

export type GallerySort = 'new' | 'popular'

export const GALLERY_SORTS: readonly GallerySort[] = ['new', 'popular']

/** Карточек на страницу и жёсткий потолок страниц: см. спеку про offset-пагинацию. */
export const GALLERY_PAGE_SIZE = 12
export const GALLERY_MAX_PAGE = 10

/** Выше стольки ячеек карточка рисует упрощённый плейсхолдер, а не полный SVG. */
export const GALLERY_CELL_LIMIT = 2000

export type GalleryError = 'unauthenticated' | 'invalid' | 'notFound' | 'failed' | 'limit' | 'alreadyOwned'

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
  /** Снапшот документа. Только для серверного рендера превью, на клиента не уезжает. */
  readonly design: Design
}

export interface GalleryPage {
  readonly items: readonly GalleryCard[]
  readonly page: number
  readonly sort: GallerySort
  readonly hasMore: boolean
}

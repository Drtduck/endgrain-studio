import { GALLERY_MAX_PAGE, GALLERY_PAGE_SIZE, GALLERY_SORTS, type GallerySort } from './types'

export interface GalleryParams {
  readonly sort: GallerySort
  /** Номер страницы, считая с 1 (человеку в URL проще ?page=1, чем ?page=0). */
  readonly page: number
}

/**
 * Параметры из searchParams: чужой sort, страница 0, отрицательная или выше
 * потолка молча приводятся к дефолту, а не роняют страницу ошибкой. Галерея
 * должна открываться с любым мусором в адресной строке.
 */
export function parseGalleryParams(searchParams: Readonly<Record<string, string | string[] | undefined>>): GalleryParams {
  const rawSort = searchParams['sort']
  const sortValue = Array.isArray(rawSort) ? rawSort[0] : rawSort
  const sort: GallerySort = (GALLERY_SORTS as readonly string[]).includes(sortValue ?? '') ? (sortValue as GallerySort) : 'new'

  const rawPage = searchParams['page']
  const pageValue = Array.isArray(rawPage) ? rawPage[0] : rawPage
  const parsedPage = Number(pageValue)
  const page = Number.isInteger(parsedPage) && parsedPage >= 1 && parsedPage <= GALLERY_MAX_PAGE ? parsedPage : 1

  return { sort, page }
}

/** offset для limit/offset пагинации: страница 1 это offset 0. */
export function galleryOffset(page: number): number {
  return (page - 1) * GALLERY_PAGE_SIZE
}

/**
 * Print-файл для заказа мерча (спека merch-orders.md, §3).
 *
 * Мокап (`components/promo/boardPng.ts`, REFERENCE_PX = 1024) годится для
 * экрана и категорически мал для печати: на постере 18x24" это ~57 dpi.
 * Поэтому print-файл рисуется отдельно, на сервере, в разрешении области
 * печати конкретного товара.
 */
import 'server-only'
import sharp from 'sharp'
import type { BoardModel } from '@/lib/engine'
import { renderBoardSvg } from '@/lib/export'
import { PRINTFUL_PLACEMENTS } from '@/lib/promo/printfulCatalog'
import type { MerchProductId } from '@/lib/promo/types'

/** Потолок стороны print-файла, px. Постер (5400 px по короткой стороне) иначе раздулся бы в десятки мегабайт. */
export const MERCH_PRINT_MAX_PX = 4000

/** Публичный bucket под print-файлы, заведён миграцией 20260816110000_merch_prints_bucket.sql. */
export const MERCH_PRINTS_BUCKET = 'merch-prints'

/** Сколько живёт объект до уборки. Заказ подтверждается не сразу (confirm=false), 90 дней с запасом. */
export const MERCH_PRINTS_TTL_DAYS = 90

/**
 * Сторона квадратного print-файла по товару, px. Область печати у Printful
 * прямоугольная (у одежды выше, чем шире), а узор доски квадратный - значит
 * вписываем квадрат по меньшей стороне области, ровно как `centeredSquare`
 * из lib/promo/printfulCatalog.ts считает позицию макета. Ограничено
 * потолком MERCH_PRINT_MAX_PX.
 */
export function printSidePx(id: MerchProductId): number {
  const place = PRINTFUL_PLACEMENTS[id]
  const side = Math.min(place.areaWidthPx, place.areaHeightPx)
  return Math.min(side, MERCH_PRINT_MAX_PX)
}

export interface MerchPrintFile {
  readonly buffer: Buffer
  /** Сторона файла, px. Всегда квадрат: buffer имеет ровно sidePx x sidePx. */
  readonly sidePx: number
}

/**
 * Рендерит узор доски в квадратный PNG заданной стороны.
 *
 * `renderBoardSvg({ maxPx: side })` масштабирует так, чтобы БОЛЬШАЯ сторона
 * доски (доска не обязана быть квадратной, мм ширины и высоты произвольны)
 * легла в `side`, но итоговый SVG при этом не квадратный сам по себе. Чтобы
 * получить ровно `side x side`, как того ждёт `centeredSquare` (там ширина
 * и высота позиции макета равны друг другу), канва добивается полями:
 * `fit: 'contain'` вписывает рендер без обрезки, `background: '#ffffff'`
 * добивает недостающее белым - тот же приём, что и в `cropForMarketplace`
 * (`lib/promo/crop.ts`) для pad-режима. Апскейла нет: `maxPx` уже задаёт
 * длинную сторону ровно в `side`, sharp только добивает короткую.
 */
export async function renderMerchPrint(model: BoardModel, id: MerchProductId): Promise<MerchPrintFile> {
  const side = printSidePx(id)
  const { svg } = renderBoardSvg(model, { maxPx: side, background: '#ffffff' })
  const buffer = await sharp(Buffer.from(svg))
    .resize({
      width: side,
      height: side,
      fit: 'contain',
      background: '#ffffff',
      position: 'centre',
      withoutEnlargement: false,
    })
    .png()
    .toBuffer()
  return { buffer, sidePx: side }
}

/**
 * Путь объекта в bucket merch-prints: `{user_id или anon}/{orderId}.png`
 * (спека §3.3). Неугадываемость обеспечивает не сам путь, а `orderId` -
 * он всегда uuid (`gen_random_uuid()` в миграции merch_orders), то есть
 * случайное значение, а не порядковый номер. Привязка к заказу, а не ко
 * времени, как у промо-мокапов: файл обязан пережить черновик заказа,
 * который Printful может забрать не сразу.
 */
export function merchPrintPath(userId: string, orderId: string): string {
  const safeUser = userId.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64) || 'anon'
  const safeOrderId = orderId.replace(/[^a-zA-Z0-9-]/g, '')
  return `${safeUser}/${safeOrderId}.png`
}

/**
 * Сторона миниатюры «Моих заказов» (ревью 15.08.2026, п.6): панель заказа
 * тянула сам print-файл (до 4000 px) под миниатюру 64x64 - лишние мегабайты
 * ради картинки размером с иконку. Второй файл рядом с полноразмерным решает
 * это без ветвления в схеме: путь выводится из print_path заменой суффикса
 * (merchThumbPath), колонка в базе не нужна.
 */
export const MERCH_THUMB_PX = 256

/** Путь превью: `{...}/{orderId}.png` -> `{...}/{orderId}.thumb.png`. */
export function merchThumbPath(printPath: string): string {
  return printPath.replace(/\.png$/i, '.thumb.png')
}

/**
 * Уменьшенная копия уже отрендеренного print-файла. Пересчёт из исходного
 * буфера, а не повторный renderBoardSvg: превью нужно то же самое изображение,
 * что уйдёт в печать, просто меньше - лишний проход через SVG не добавляет
 * точности, только время.
 */
export async function renderMerchThumb(source: Buffer): Promise<Buffer> {
  return sharp(source)
    .resize({
      width: MERCH_THUMB_PX,
      height: MERCH_THUMB_PX,
      fit: 'contain',
      background: '#ffffff',
      position: 'centre',
    })
    .png()
    .toBuffer()
}

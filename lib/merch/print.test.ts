import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { compile } from '@/lib/engine'
import { makeCheckerboard } from '@/lib/designs/samples'
import { PRINTFUL_PLACEMENTS } from '@/lib/promo/printfulCatalog'
import type { MerchProductId } from '@/lib/promo/types'
import { MERCH_PRINT_MAX_PX, merchPrintPath, printSidePx, renderMerchPrint } from './print'

const model = compile(makeCheckerboard())
const productIds: readonly MerchProductId[] = ['tshirt', 'mug', 'poster', 'apron']

describe('printSidePx', () => {
  it('равна меньшей стороне области печати для товаров, не упирающихся в потолок', () => {
    expect(printSidePx('tshirt')).toBe(Math.min(PRINTFUL_PLACEMENTS['tshirt'].areaWidthPx, PRINTFUL_PLACEMENTS['tshirt'].areaHeightPx))
    expect(printSidePx('mug')).toBe(Math.min(PRINTFUL_PLACEMENTS['mug'].areaWidthPx, PRINTFUL_PLACEMENTS['mug'].areaHeightPx))
  })

  it('упирается в потолок MERCH_PRINT_MAX_PX там, где меньшая сторона области его превышает (постер 5400, фартук 4350)', () => {
    const posterSide = Math.min(PRINTFUL_PLACEMENTS['poster'].areaWidthPx, PRINTFUL_PLACEMENTS['poster'].areaHeightPx)
    const apronSide = Math.min(PRINTFUL_PLACEMENTS['apron'].areaWidthPx, PRINTFUL_PLACEMENTS['apron'].areaHeightPx)
    expect(posterSide).toBeGreaterThan(MERCH_PRINT_MAX_PX)
    expect(apronSide).toBeGreaterThan(MERCH_PRINT_MAX_PX)
    expect(printSidePx('poster')).toBe(MERCH_PRINT_MAX_PX)
    expect(printSidePx('apron')).toBe(MERCH_PRINT_MAX_PX)
  })

  it('никогда не превышает потолок ни для одного товара из каталога', () => {
    for (const id of productIds) expect(printSidePx(id)).toBeLessThanOrEqual(MERCH_PRINT_MAX_PX)
  })
})

describe('renderMerchPrint', () => {
  it('даёт PNG ровно заданной квадратной стороны для кружки (без потолка)', async () => {
    const { buffer, sidePx } = await renderMerchPrint(model, 'mug')
    expect(sidePx).toBe(printSidePx('mug'))
    const meta = await sharp(buffer).metadata()
    expect(meta.format).toBe('png')
    expect(meta.width).toBe(sidePx)
    expect(meta.height).toBe(sidePx)
  })

  it('упирается в потолок для постера и всё равно даёт квадрат 4000x4000', async () => {
    const { buffer, sidePx } = await renderMerchPrint(model, 'poster')
    expect(sidePx).toBe(MERCH_PRINT_MAX_PX)
    const meta = await sharp(buffer).metadata()
    expect(meta.width).toBe(MERCH_PRINT_MAX_PX)
    expect(meta.height).toBe(MERCH_PRINT_MAX_PX)
  }, 30_000)

  it('реально получается PNG заданного размера для футболки', async () => {
    const { buffer, sidePx } = await renderMerchPrint(model, 'tshirt')
    expect(sidePx).toBe(1800)
    const meta = await sharp(buffer).metadata()
    expect(meta.width).toBe(1800)
    expect(meta.height).toBe(1800)
  })
})

describe('merchPrintPath', () => {
  it('складывается из пользователя и id заказа с расширением .png', () => {
    expect(merchPrintPath('user-1', 'order-abc')).toBe('user-1/order-abc.png')
  })

  it('падает на anon, если userId пустой', () => {
    expect(merchPrintPath('', 'order-abc')).toBe('anon/order-abc.png')
  })

  it('путь неугадываем: разные заказы одного пользователя дают разные пути без общего префикса-счётчика', () => {
    const a = merchPrintPath('user-1', '11111111-1111-4111-8111-111111111111')
    const b = merchPrintPath('user-1', '22222222-2222-4222-8222-222222222222')
    expect(a).not.toBe(b)
    // Оба пути делят префикс пользователя (это ожидаемо и не секрет), но
    // хвост - случайный uuid заказа, а не последовательный номер: соседние
    // по времени заказы не дают соседних по алфавиту путей.
    expect(a.split('/')[0]).toBe(b.split('/')[0])
    expect(a.split('/')[1]).not.toBe(b.split('/')[1])
  })

  it('вырезает недопустимые символы из id, чтобы путь оставался безопасным ключом объекта', () => {
    expect(merchPrintPath('user/../1', 'order/../2')).toBe('user1/order2.png')
  })
})

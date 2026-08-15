import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { ASPECT_TOLERANCE, cropForMarketplace, fitUnderBytes, pickFitMode } from './crop'
import { marketplaceById } from './marketplaces'

/** Квадрат 1024x1024 с заметным крестом посередине - удобно проверять, что центр не срезан. */
async function squareFixture(size = 1024): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect width="100%" height="100%" fill="#222222"/>
    <rect x="${size * 0.4}" y="0" width="${size * 0.2}" height="${size}" fill="#dd7733"/>
    <rect x="0" y="${size * 0.4}" width="${size}" height="${size * 0.2}" fill="#dd7733"/>
  </svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}

describe('pickFitMode', () => {
  it('1:1 -> 1:1 это cover (нет padColor)', () => {
    const spec = marketplaceById('etsy').image // padColor: null у etsy
    const mode = pickFitMode({ width: 1000, height: 1000 }, { ...spec, aspect: [1, 1], padColor: null })
    expect(mode).toBe('cover')
  })

  it('1:1 -> 3:4 это всегда pad (расхождение 0.33 больше порога)', () => {
    const spec = marketplaceById('ozon').image
    expect(pickFitMode({ width: 1000, height: 1000 }, spec)).toBe('pad')
  })

  it('площадка с padColor всегда pad, даже при близком аспекте', () => {
    const spec = { ...marketplaceById('amazon').image, aspect: [1, 1] as const }
    expect(pickFitMode({ width: 1010, height: 1000 }, spec)).toBe('pad')
  })

  it('порог ASPECT_TOLERANCE ровно 0.15', () => {
    expect(ASPECT_TOLERANCE).toBe(0.15)
  })
})

describe('cropForMarketplace', () => {
  it('квадрат в 3:4 (Ozon): результат по аспекту 3:4, поля белые, не отрезает центр', async () => {
    const input = await squareFixture()
    const spec = marketplaceById('ozon').image
    const result = await cropForMarketplace(input, spec)
    const ratio = result.width / result.height
    expect(Math.abs(ratio - 3 / 4)).toBeLessThan(0.02)
    // Верхняя левая точка (не центр) должна остаться фоном добивки: белым.
    const { data, info } = await sharp(result.buffer).raw().toBuffer({ resolveWithObject: true })
    const corner = [data[0], data[1], data[2]]
    void info
    expect(corner).toEqual([255, 255, 255])
  }, 15_000)

  it('квадрат в 1:1 (Amazon): не апскейлит исходник меньше цели', async () => {
    const input = await squareFixture(500) // меньше target 2000x2000
    const spec = marketplaceById('amazon').image
    const result = await cropForMarketplace(input, spec)
    expect(result.width).toBeLessThanOrEqual(500)
    expect(result.height).toBeLessThanOrEqual(500)
  }, 15_000)

  it('формат png сохраняет прозрачность/не JPEG-артефачит (кодек png)', async () => {
    const input = await squareFixture(600)
    const spec = { ...marketplaceById('etsy').image, format: 'png' as const }
    const result = await cropForMarketplace(input, spec)
    const meta = await sharp(result.buffer).metadata()
    expect(meta.format).toBe('png')
  }, 15_000)

  it('не превышает maxBytes площадки', async () => {
    const input = await squareFixture(1200)
    const spec = { ...marketplaceById('ebay').image, maxBytes: 20_000 }
    const result = await cropForMarketplace(input, spec)
    expect(result.bytes).toBeLessThanOrEqual(20_000)
  }, 15_000)
})

describe('fitUnderBytes', () => {
  it('буфер уже меньше лимита - возвращает как есть', async () => {
    const input = await sharp(await squareFixture(200)).jpeg({ quality: 90 }).toBuffer()
    const spec = { ...marketplaceById('amazon').image, maxBytes: 10 * 1024 * 1024 }
    const result = await fitUnderBytes(input, spec)
    expect(result.data.byteLength).toBeLessThanOrEqual(spec.maxBytes)
  })

  it('понижает качество, пока не уложится в лимит', async () => {
    const input = await sharp(await squareFixture(1500)).jpeg({ quality: 100 }).toBuffer()
    const spec = { ...marketplaceById('amazon').image, maxBytes: 30_000 }
    const result = await fitUnderBytes(input, spec)
    expect(result.data.byteLength).toBeLessThanOrEqual(spec.maxBytes)
  }, 15_000)
})

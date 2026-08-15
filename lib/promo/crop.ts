import 'server-only'
import sharp from 'sharp'
import type { MarketplaceImageSpec } from './marketplaces'

/**
 * Кроп готового кадра под требования площадки (спека, раздел 7.3). Кадр
 * рождается квадратным (aspect_ratio: '1:1' у nano banana 2), из квадрата
 * нужно получить 3:4 / 4:3 / etc. без потери самого узора.
 */

export type FitMode = 'cover' | 'pad'

/**
 * Две стратегии, и выбор между ними не вкусовщина.
 *
 * cover: кропаем по центру, лишнее отрезаем. Годится, когда целевой аспект
 * близок к исходному (расхождение до 15%) - обрежется фон, не объект.
 *
 * pad: вписываем целиком и добиваем полями цвета padColor. Обязателен для
 * площадок с требованием белого фона: там поля не портят кадр, а достраивают
 * тот самый белый фон, которого площадка и хочет. Обязателен и когда аспекты
 * расходятся сильно: квадрат в 3:4 через cover отрежет четверть ширины, а
 * вместе с ней и края доски.
 *
 * Порог 0.15 подобран по геометрии: 1:1 -> 3:4 это расхождение 0.33, всегда
 * pad; 1:1 -> 4:3 то же самое; 1:1 -> 1:1 это 0, всегда cover.
 */
export const ASPECT_TOLERANCE = 0.15

export function pickFitMode(
  source: { readonly width: number; readonly height: number },
  spec: MarketplaceImageSpec,
): FitMode {
  if (spec.padColor !== null) return 'pad'
  const srcRatio = source.width / source.height
  const dstRatio = spec.aspect[0] / spec.aspect[1]
  const drift = Math.abs(srcRatio - dstRatio) / dstRatio
  return drift <= ASPECT_TOLERANCE ? 'cover' : 'pad'
}

/**
 * Sharp's `fit: 'contain'` + `withoutEnlargement` не работают вместе так, как
 * можно ожидать: withoutEnlargement там не мешает канве раздуться до полного
 * target-размера белыми полями, апскейлится только содержимое остаётся на
 * месте, а сама канва (то есть итоговый файл) всё равно выходит в полный
 * 2000x2000 - соврать про «2000 px для Amazon», имея 500 px исходник. `fit:
 * 'cover'` от withoutEnlargement страдает не так - там он честно ужимает
 * канву до исходника.
 *
 * Поэтому для pad-режима, когда исходник меньше цели, канва считается вручную:
 * наименьший прямоугольник с аспектом площадки, который вмещает исходник БЕЗ
 * увеличения контента (спека 7.0, п.2 - никакого апскейла никогда).
 */
function effectiveCanvas(
  source: { readonly width: number; readonly height: number },
  spec: MarketplaceImageSpec,
  mode: FitMode,
): { readonly width: number; readonly height: number } {
  if (mode === 'cover') return spec.target
  const contentScale = Math.min(spec.target.width / source.width, spec.target.height / source.height)
  if (contentScale <= 1) return spec.target
  const destRatio = spec.target.width / spec.target.height
  const canvasWidth = Math.max(source.width, Math.round(source.height * destRatio))
  const canvasHeight = Math.max(1, Math.round(canvasWidth / destRatio))
  return { width: canvasWidth, height: canvasHeight }
}

export interface CropResult {
  readonly buffer: Buffer
  readonly width: number
  readonly height: number
  readonly bytes: number
}

/** Шаги понижения качества JPEG при попытке уложиться в maxBytes площадки. */
const QUALITY_STEPS: readonly number[] = [88, 80, 72, 64]

/**
 * Кроп под площадку. Апскейла нет никогда: если исходник меньше целевого
 * размера, sharp с withoutEnlargement уменьшает целевой размер до исходного
 * с сохранением аспекта, вместо того чтобы интерполяцией дорисовывать пиксели,
 * которых не было - это мыло с большим весом, а не качество (спека 7.0, п.2).
 *
 * Качество 88 и chromaSubsampling '4:4:4' не случайны: торцевой узор - это
 * высокочастотная геометрия с резкими границами пород, и стандартный 4:2:0
 * даёт цветные ореолы на стыках орех/клён - ровно та деталь, ради которой
 * продают доску.
 */
export async function cropForMarketplace(input: Buffer, spec: MarketplaceImageSpec): Promise<CropResult> {
  const meta = await sharp(input).metadata()
  const source = { width: meta.width ?? spec.target.width, height: meta.height ?? spec.target.height }
  const mode = pickFitMode(source, spec)
  const canvas = effectiveCanvas(source, spec, mode)

  const resized = sharp(input).resize({
    width: canvas.width,
    height: canvas.height,
    fit: mode === 'pad' ? 'contain' : 'cover',
    background: spec.padColor ?? '#FFFFFF',
    position: 'centre',
    withoutEnlargement: true,
  })

  const encoded =
    spec.format === 'png'
      ? await resized.png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true })
      : await resized.jpeg({ quality: QUALITY_STEPS[0], chromaSubsampling: '4:4:4', mozjpeg: true }).toBuffer({ resolveWithObject: true })

  const fitted = await fitUnderBytes(encoded.data, spec)
  return { buffer: fitted.data, width: fitted.info.width, height: fitted.info.height, bytes: fitted.data.byteLength }
}

interface EncodedBuffer {
  readonly data: Buffer
  readonly info: { readonly width: number; readonly height: number }
}

/**
 * Проверка maxBytes: если результат тяжелее лимита площадки, понижаем quality
 * шагами 88 -> 80 -> 72 -> 64 и пересобираем из уже отрезанного/добитого кадра
 * (никакого повторного resize - только перекодирование). Ниже 64 не опускаемся,
 * вместо этого уменьшаем размер на 15% и пробуем ещё раз с тем же шагом качества.
 */
export async function fitUnderBytes(buffer: Buffer, spec: MarketplaceImageSpec): Promise<EncodedBuffer> {
  if (spec.format === 'png' || buffer.byteLength <= spec.maxBytes) {
    const meta = await sharp(buffer).metadata()
    return { data: buffer, info: { width: meta.width ?? spec.target.width, height: meta.height ?? spec.target.height } }
  }

  let current = buffer
  let scale = 1
  const lowestQuality = QUALITY_STEPS[QUALITY_STEPS.length - 1] as number
  for (let attempt = 0; attempt < 3; attempt += 1) {
    for (const quality of QUALITY_STEPS) {
      const re = await sharp(current)
        .jpeg({ quality, chromaSubsampling: '4:4:4', mozjpeg: true })
        .toBuffer({ resolveWithObject: true })
      if (re.data.byteLength <= spec.maxBytes) {
        return { data: re.data, info: { width: re.info.width, height: re.info.height } }
      }
    }
    // Все шаги качества исчерпаны и всё ещё тяжелее лимита: уменьшаем размер на 15%.
    scale *= 0.85
    const meta = await sharp(buffer).metadata()
    const nextWidth = Math.max(1, Math.round((meta.width ?? spec.target.width) * scale))
    const nextHeight = Math.max(1, Math.round((meta.height ?? spec.target.height) * scale))
    current = await sharp(buffer).resize({ width: nextWidth, height: nextHeight, fit: 'fill' }).toBuffer()
  }
  const encoded = await sharp(current)
    .jpeg({ quality: lowestQuality, chromaSubsampling: '4:4:4', mozjpeg: true })
    .toBuffer({ resolveWithObject: true })
  return { data: encoded.data, info: { width: encoded.info.width, height: encoded.info.height } }
}

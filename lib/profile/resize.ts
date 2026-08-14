import { AVATAR_SIZE_PX } from './avatar'

/**
 * Ресайз картинки до квадрата AVATAR_SIZE_PX в браузере, до загрузки в Storage.
 * Режем на клиенте, а не на сервере: снимок с телефона это несколько мегабайт,
 * которые иначе прошли бы через нашу сеть целиком ради картинки 256 px, а
 * bucket avatars ограничен мегабайтом (миграция 20260814170000).
 *
 * Кадрируем по короткой стороне (cover), а не сжимаем пропорции: аватар всегда
 * рисуется кругом, и растянутое лицо в нём выглядит как баг.
 */
export async function resizeToSquarePng(file: Blob, size: number = AVATAR_SIZE_PX): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (ctx === null) throw new Error('canvas 2d context unavailable')

    const side = Math.min(bitmap.width, bitmap.height)
    const sx = Math.round((bitmap.width - side) / 2)
    const sy = Math.round((bitmap.height - side) / 2)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size)

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob === null) reject(new Error('canvas.toBlob returned null'))
        else resolve(blob)
      }, 'image/png')
    })
  } finally {
    bitmap.close()
  }
}

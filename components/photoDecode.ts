'use client'

import { PHOTO_MAX_COLS, PHOTO_MAX_ROWS, type PixelGrid } from '@/lib/photo'

export const ACCEPTED_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp']

export function isImageFile(file: File): boolean {
  return ACCEPTED_TYPES.includes(file.type) || file.type.startsWith('image/')
}

/** Сетка под пропорции картинки: портрет не должен превращаться в квадрат. */
export function fitGrid(
  width: number,
  height: number,
  maxCols = PHOTO_MAX_COLS,
  maxRows = PHOTO_MAX_ROWS,
): { cols: number; rows: number } {
  if (width <= 0 || height <= 0) return { cols: maxCols, rows: maxRows }
  const scale = Math.min(maxCols / width, maxRows / height)
  return {
    cols: Math.max(2, Math.min(maxCols, Math.round(width * scale))),
    rows: Math.max(2, Math.min(maxRows, Math.round(height * scale))),
  }
}

async function toBitmapSize(file: File): Promise<{ source: CanvasImageSource; width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file)
    return { source: bitmap, width: bitmap.width, height: bitmap.height }
  }
  // Запасной путь для браузеров без createImageBitmap: тот же результат, только через тег img.
  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('картинка не декодировалась'))
      element.src = url
    })
    return { source: image, width: image.naturalWidth, height: image.naturalHeight }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Картинка в сетку клеток. Даунсемпл делает сам браузер через drawImage:
 * усреднение по площади нам и нужно, а руками оно вышло бы медленнее и хуже.
 */
export async function decodeToGrid(
  file: File,
  maxCols = PHOTO_MAX_COLS,
  maxRows = PHOTO_MAX_ROWS,
): Promise<PixelGrid> {
  const { source, width, height } = await toBitmapSize(file)
  const { cols, rows } = fitGrid(width, height, maxCols, maxRows)

  const canvas = document.createElement('canvas')
  canvas.width = cols
  canvas.height = rows
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('нет 2d-контекста')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(source, 0, 0, cols, rows)
  const data = context.getImageData(0, 0, cols, rows)

  return { cols, rows, rgba: data.data }
}

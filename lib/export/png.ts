import type { RenderedSvg } from './svg'

export interface PngOptions {
  /** Множитель разрешения поверх пиксельного размера сцены. 2 даёт «ретину», 4 годится для печати. */
  readonly scale?: number
  readonly background?: string
}

const SVG_MIME = 'image/svg+xml;charset=utf-8'

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('svg image failed to load'))
    image.src = url
  })
}

/**
 * SVG-строка -> PNG Blob через canvas. Только браузер: в jsdom нет 2D-контекста и нет toBlob,
 * поэтому модуль не покрыт unit-тестами и живёт под e2e/export.spec.ts.
 * Blob-URL, а не data:URI: у data:URI в Chromium есть предел длины, а наши доски бывают на 4000 ячеек.
 */
export async function svgToPngBlob(rendered: RenderedSvg, options: PngOptions = {}): Promise<Blob> {
  const scale = options.scale ?? 2
  const width = Math.max(1, Math.round(rendered.widthPx * scale))
  const height = Math.max(1, Math.round(rendered.heightPx * scale))

  const url = URL.createObjectURL(new Blob([rendered.svg], { type: SVG_MIME }))
  try {
    const image = await loadImage(url)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2d context unavailable')
    // Подложка обязательна: без неё PNG выходит с прозрачным фоном и в мессенджерах чернеет.
    ctx.fillStyle = options.background ?? '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(image, 0, 0, width, height)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob returned null'))), 'image/png')
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

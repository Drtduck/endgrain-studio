import type { BoardModel, RowBand } from '@/lib/engine'
import { boardLayout } from '@/lib/render2d/layout'
import { speciesHex } from '@/lib/species'

/** Высота строки заголовка и подписи в миллиметрах сцены. */
const TITLE_MM = 12
const CAPTION_MM = 9
const TEXT_PADDING_MM = 4

export interface BoardSvgOptions {
  /** Заголовок над доской. Пустая строка и undefined одинаково означают «без заголовка». */
  readonly title?: string
  /** Подпись под доской: габарит, породы, дата. Ложится в одну или несколько строк. */
  readonly caption?: string
  readonly maxPx?: number
  readonly background?: string
  readonly rowLabels?: readonly RowBand[]
}

export interface RenderedSvg {
  readonly svg: string
  readonly widthPx: number
  readonly heightPx: number
}

const XML_ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
}

export function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => XML_ENTITIES[char] ?? char)
}

/** Число в атрибут: без хвостов вида 0.30000000000000004, которые раздувают файл. */
function num(value: number): string {
  return String(Number(value.toFixed(3)))
}

/**
 * Самостоятельный SVG-документ доски: открывается в браузере и в Inkscape,
 * годится как вход для растровой конвертации в PNG и для svg2pdf (PDF).
 * Чистая функция: ни одного обращения к DOM, поэтому тестируется в vitest напрямую.
 */
export function renderBoardSvg(model: BoardModel, options: BoardSvgOptions = {}): RenderedSvg {
  const title = options.title ?? ''
  const caption = options.caption ?? ''
  const background = options.background ?? '#ffffff'
  const labels = options.rowLabels ?? []
  const hasLabels = labels.length > 0
  const headMm = title === '' ? 0 : TITLE_MM + TEXT_PADDING_MM
  const footMm = caption === '' ? 0 : CAPTION_MM + TEXT_PADDING_MM

  const layout = boardLayout(model, {
    ...(options.maxPx === undefined ? {} : { maxPx: options.maxPx }),
    withRowLabels: hasLabels,
    captionMm: headMm + footMm,
  })

  const parts: string[] = []
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${layout.viewBox}"` +
      ` width="${num(layout.widthPx)}" height="${num(layout.heightPx)}">`,
  )
  parts.push(`<rect x="0" y="0" width="${num(layout.totalWidthMm)}" height="${num(layout.totalHeightMm)}" fill="${background}"/>`)

  if (title !== '') {
    parts.push(
      `<text x="${num(layout.totalWidthMm / 2)}" y="${num(TITLE_MM * 0.8)}" text-anchor="middle"` +
        ` font-family="sans-serif" font-size="${num(TITLE_MM * 0.8)}" fill="#111111">${escapeXml(title)}</text>`,
    )
  }

  parts.push(`<g transform="translate(${num(layout.marginMm)} ${num(headMm)})">`)
  for (const cell of model.cells) {
    parts.push(
      `<rect x="${num(cell.xMm)}" y="${num(cell.yMm)}" width="${num(cell.widthMm)}" height="${num(cell.heightMm)}"` +
        ` fill="${speciesHex(cell.speciesId)}" stroke="rgba(0,0,0,0.18)" stroke-width="0.4"/>`,
    )
  }
  parts.push('</g>')

  if (hasLabels) {
    labels.forEach((band, index) => {
      const fontMm = Math.min(6, Math.max(3, band.heightMm * 0.4))
      parts.push(
        `<text x="${num(layout.marginMm / 2)}" y="${num(headMm + band.topMm + band.heightMm / 2)}"` +
          ` text-anchor="middle" dominant-baseline="middle" font-family="sans-serif"` +
          ` font-size="${num(fontMm)}" fill="#111111">${index + 1}</text>`,
      )
    })
  }

  if (caption !== '') {
    parts.push(
      `<text x="${num(layout.totalWidthMm / 2)}" y="${num(layout.totalHeightMm - CAPTION_MM * 0.25)}"` +
        ` text-anchor="middle" font-family="sans-serif" font-size="${num(CAPTION_MM * 0.7)}"` +
        ` fill="#444444">${escapeXml(caption)}</text>`,
    )
  }

  parts.push('</svg>')
  return { svg: parts.join(''), widthPx: layout.widthPx, heightPx: layout.heightPx }
}

export function boardSvgString(model: BoardModel, options: BoardSvgOptions = {}): string {
  return renderBoardSvg(model, options).svg
}

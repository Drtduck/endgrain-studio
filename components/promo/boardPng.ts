import type { BoardModel } from '@/lib/engine'
import { renderBoardSvg } from '@/lib/export'

/** Сторона рендера доски, который уходит в промпт. Больше 1024 Gemini всё равно ужмёт сам. */
export const REFERENCE_PX = 1024

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('FileReader failed'))
    reader.readAsDataURL(blob)
  })
}

/**
 * Рендер доски в PNG data-url. Один хелпер на три панели вкладки: серия кадров,
 * генерация по референсу и мокапы мерча отправляют на сервер ровно один и тот же
 * файл, и расходиться в размере или подложке им незачем.
 *
 * Растеризация грузится динамически: канвас-конвертер не должен ехать в первый
 * бандл страницы ради кнопки, на которую нажмут не все.
 */
export async function boardPngDataUrl(model: BoardModel, maxPx: number = REFERENCE_PX): Promise<string> {
  const { svgToPngBlob } = await import('@/lib/export/png')
  const rendered = renderBoardSvg(model, { maxPx })
  return blobToDataUrl(await svgToPngBlob(rendered, { scale: 1 }))
}

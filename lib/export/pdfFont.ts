import type { jsPDF } from 'jspdf'

/**
 * Кириллица в jsPDF. Встроенные шрифты PDF знают только WinAnsi, поэтому русский текст
 * без подмены шрифта выходит пустыми глифами и без единой ошибки в консоли.
 * TTF лежит в public/ и грузится по клику: в JS-бандл не попадает ни байта.
 * Шрифт: PT Sans (SIL Open Font License, public/fonts/OFL.txt), субсеты Latin+Cyrillic
 * через pyftsubset --unicodes=U+0000-024F,U+0400-04FF --no-hinting --desubroutinize
 * (исходная пара весила ~890 КБ, субсет - около 73 КБ).
 */
export const PDF_FONT_FAMILY = 'PTSans'

export const PDF_FONT_URLS = {
  normal: '/fonts/PTSans-Regular.ttf',
  bold: '/fonts/PTSans-Bold.ttf',
} as const

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  // Чанками: apply на 200 КБ разом кладёт стек в Safari.
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

async function addFace(doc: jsPDF, url: string, style: 'normal' | 'bold'): Promise<void> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`font ${url}: ${response.status}`)
  const fileName = url.split('/').pop() ?? 'font.ttf'
  doc.addFileToVFS(fileName, toBase64(await response.arrayBuffer()))
  doc.addFont(fileName, PDF_FONT_FAMILY, style)
}

/**
 * true - кириллица доступна и документ переключён на PT Sans.
 * false - шрифт не отдался (офлайн, 404, CSP): вызывающий код обязан печатать по-английски
 * встроенным helvetica, иначе получится PDF из пустых квадратов.
 */
export async function registerCyrillicFont(doc: jsPDF): Promise<boolean> {
  try {
    await Promise.all([addFace(doc, PDF_FONT_URLS.normal, 'normal'), addFace(doc, PDF_FONT_URLS.bold, 'bold')])
    doc.setFont(PDF_FONT_FAMILY, 'normal')
    return true
  } catch {
    doc.setFont('helvetica', 'normal')
    return false
  }
}

/**
 * Скачивание файла из браузера. Только этот модуль во всём lib/export
 * знает про document и URL, поэтому только он не покрыт vitest (см. purity.test.ts).
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.rel = 'noopener'
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Отзываем на следующем тике: Safari успевает начать загрузку только после возврата из клика.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function downloadText(text: string, fileName: string, mimeType: string): void {
  downloadBlob(new Blob([text], { type: mimeType }), fileName)
}

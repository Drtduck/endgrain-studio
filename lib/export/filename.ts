const MAX_STEM = 64

/**
 * Имя скачиваемого файла из названия проекта.
 * Кириллица остаётся: современные браузеры и файловые системы её держат,
 * а транслитерация сделала бы «Шахматка» нечитаемой в папке «Загрузки».
 */
export function safeFileName(designName: string, extension: string): string {
  const stem = designName
    // Пробел и дефис стоят последними в классе символов: иначе «[ -<]» стало бы диапазоном
    // от пробела до «<» и съело бы цифры, точки и скобки.
    .replace(/[<>:"/\\|?* -]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_STEM)
    .replace(/-+$/g, '')
  return `${stem === '' ? 'endgrain' : stem}.${extension}`
}

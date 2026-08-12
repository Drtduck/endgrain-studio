import { describe, it, expect } from 'vitest'
import { fitGrid, isFileTooLarge, PHOTO_MAX_FILE_BYTES } from './photoDecode'

function fileOfSize(bytes: number): File {
  const file = new File([new Uint8Array(1)], 'demo.png', { type: 'image/png' })
  // File.size обычно только для чтения: подменяем геттер, не выделяя реальную память под тест.
  Object.defineProperty(file, 'size', { value: bytes })
  return file
}

describe('isFileTooLarge', () => {
  it('пропускает файл в пределах лимита', () => {
    expect(isFileTooLarge(fileOfSize(PHOTO_MAX_FILE_BYTES))).toBe(false)
    expect(isFileTooLarge(fileOfSize(1024))).toBe(false)
  })

  it('отвергает файл сверх лимита', () => {
    expect(isFileTooLarge(fileOfSize(PHOTO_MAX_FILE_BYTES + 1))).toBe(true)
    expect(isFileTooLarge(fileOfSize(300 * 1024 * 1024))).toBe(true)
  })
})

describe('fitGrid', () => {
  it('не выходит за потолок сетки на огромном разрешении', () => {
    const { cols, rows } = fitGrid(6000, 4000, 24, 16)
    expect(cols).toBeLessThanOrEqual(24)
    expect(rows).toBeLessThanOrEqual(16)
  })
})

import { describe, expect, it } from 'vitest'
import { baseDesign } from '@/lib/engine/fixtures'
import { designDisplayName } from './name'

describe('designDisplayName', () => {
  it('собственное имя выигрывает у ключа словаря', () => {
    const design = baseDesign({ name: 'Моя доска', nameKey: 'tpl.chess-8x8' })
    expect(designDisplayName(design, 'ru')).toBe('Моя доска')
    expect(designDisplayName(design, 'en')).toBe('Моя доска')
  })

  it('пустое имя переводится по ключу в обеих локалях', () => {
    const design = baseDesign({ name: '', nameKey: 'tpl.chess-8x8' })
    expect(designDisplayName(design, 'ru')).toBe('Шахматная доска 8 на 8')
    expect(designDisplayName(design, 'en')).toBe('Chessboard 8 by 8')
  })

  it('подставляет параметры имени', () => {
    const design = baseDesign({ name: '', nameKey: 'photo.designName', nameParams: { file: 'cat.png' } })
    expect(designDisplayName(design, 'ru')).toBe('Фото: cat.png')
    expect(designDisplayName(design, 'en')).toBe('Photo: cat.png')
  })

  it('документ без имени и без ключа падает на имя по умолчанию, а не на пустоту', () => {
    const design = baseDesign({ name: '   ', nameKey: undefined })
    expect(designDisplayName(design, 'ru')).toBe('Шахматка')
    expect(designDisplayName(design, 'en')).toBe('Checkerboard')
  })
})

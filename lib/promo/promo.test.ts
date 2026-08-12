import { describe, expect, it } from 'vitest'
import { makeCheckerboard } from '@/lib/designs/samples'
import { compile } from '@/lib/engine'
import { describeBoard, patternGrain, speciesByShare } from './describe'
import { fitPatternContain, fitPatternCover } from './fit'
import { MERCH_SILHOUETTES, MERCH_SILHOUETTE_BY_ID } from './merch'
import { shotPrompt } from './prompts'
import { PROMO_DEFAULT_SHOTS, PROMO_SHOTS, PROMO_SHOT_LAYOUT, PROMO_SHOT_META, MERCH_PRODUCTS } from './types'
import en from '@/lib/i18n/en'
import ru from '@/lib/i18n/ru'

const EM_DASH = String.fromCharCode(0x2014)

describe('describeBoard', () => {
  const design = makeCheckerboard()
  const model = compile(design)

  it('называет породы английскими именами по убыванию доли', () => {
    const species = speciesByShare(model)
    expect(species).toContain('Black walnut')
    expect(species).toContain('Hard maple')
  })

  it('строка описания несёт габарит, породы и число клеток', () => {
    const d = describeBoard(design, model)
    expect(d.sizeMm).toBe('240 x 240 x 40 mm')
    expect(d.cellCount).toBe(model.cells.length)
    expect(d.text).toContain('240 x 240 x 40 mm')
    expect(d.text).toContain('Black walnut')
    expect(d.text).toContain(String(model.cells.length))
  })

  it('безымянный проект не даёт пустых кавычек в промпте', () => {
    expect(describeBoard({ ...design, name: '   ' }, model).text).toContain('Endgrain board')
  })

  it('дробность рисунка растёт вместе с числом клеток', () => {
    expect(patternGrain(4)).toBe('bold blocky')
    expect(patternGrain(64)).toBe('classic checkerboard-scale')
    expect(patternGrain(300)).toBe('detailed')
    expect(patternGrain(2000)).toBe('fine mosaic')
  })
})

describe('shotPrompt', () => {
  it('в каждый из двенадцати кадров попадает описание доски и запрет текста', () => {
    for (const kind of PROMO_SHOTS) {
      const prompt = shotPrompt(kind, 'описание доски')
      expect(prompt).toContain('описание доски')
      expect(prompt).toContain('no text')
      expect(prompt.includes(EM_DASH)).toBe(false)
    }
  })

  it('кадры отличаются друг от друга сценой', () => {
    const prompts = PROMO_SHOTS.map((kind) => shotPrompt(kind, 'x'))
    expect(new Set(prompts).size).toBe(PROMO_SHOTS.length)
  })

  it('у каждого кадра есть подпись в i18n', () => {
    expect(PROMO_SHOT_META.map((m) => m.kind)).toEqual([...PROMO_SHOTS])
    for (const meta of PROMO_SHOT_META) {
      expect(ru[meta.titleKey]).toBeTruthy()
      expect(ru[meta.noteKey]).toBeTruthy()
      expect(en[meta.titleKey]).toBeTruthy()
      expect(en[meta.noteKey]).toBeTruthy()
    }
  })

  it('пресетов дюжина и промпт каждого действительно подробный', () => {
    // Двенадцать сцен это заявленный набор, а не «четыре и восемь синонимов».
    expect(PROMO_SHOTS).toHaveLength(12)
    for (const kind of PROMO_SHOTS) {
      const scene = shotPrompt(kind, 'x').split('\n\nSubject:')[0] ?? ''
      // Свет, ракурс и оптика: без них модель рисует случайный сток.
      expect(scene.length).toBeGreaterThan(200)
      expect(scene.toLowerCase()).toMatch(/light|lit/)
      expect(scene.toLowerCase()).toMatch(/lens|macro/)
    }
  })

  it('набор по умолчанию входит в список пресетов и не пустой', () => {
    expect(PROMO_DEFAULT_SHOTS.length).toBeGreaterThan(0)
    for (const kind of PROMO_DEFAULT_SHOTS) expect(PROMO_SHOTS).toContain(kind)
  })

  it('у каждого пресета есть раскладка заглушки', () => {
    for (const kind of PROMO_SHOTS) expect(PROMO_SHOT_LAYOUT.get(kind)).toBeTruthy()
  })
})

describe('вписывание узора', () => {
  const area = { x: 10, y: 20, w: 100, h: 50 }

  it('cover закрывает область целиком и центрирует лишнее', () => {
    const fit = fitPatternCover(200, 200, area)
    expect(fit.scale).toBe(0.5)
    expect(fit.dx).toBe(10)
    expect(fit.dy).toBe(-5)
  })

  it('contain оставляет доску видимой целиком', () => {
    const fit = fitPatternContain(200, 200, area)
    expect(fit.scale).toBe(0.25)
    expect(fit.dx).toBe(35)
    expect(fit.dy).toBe(20)
  })

  it('пустая модель даёт нулевой масштаб, а не NaN', () => {
    expect(fitPatternCover(0, 0, area)).toEqual({ scale: 0, dx: 10, dy: 20 })
    expect(fitPatternContain(0, 100, area)).toEqual({ scale: 0, dx: 10, dy: 20 })
  })
})

describe('каталог мерча', () => {
  it('у каждого товара есть силуэт с областью печати', () => {
    for (const product of MERCH_PRODUCTS) {
      const silhouette = MERCH_SILHOUETTE_BY_ID.get(product.id)
      expect(silhouette, product.id).toBeDefined()
      expect(silhouette?.body.length).toBeGreaterThan(0)
      expect(silhouette?.print.w).toBeGreaterThan(0)
      expect(silhouette?.print.h).toBeGreaterThan(0)
    }
  })

  it('область печати не вылезает за пределы сцены 200x200', () => {
    for (const s of MERCH_SILHOUETTES) {
      expect(s.print.x).toBeGreaterThanOrEqual(0)
      expect(s.print.y).toBeGreaterThanOrEqual(0)
      expect(s.print.x + s.print.w).toBeLessThanOrEqual(200)
      expect(s.print.y + s.print.h).toBeLessThanOrEqual(200)
    }
  })
})

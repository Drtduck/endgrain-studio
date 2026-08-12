import { describe, it, expect } from 'vitest'
import { compile, hasErrors, validate } from '@/lib/engine'
import { SPECIES, shrinkageMap } from '@/lib/species'
import { PHOTO_MAX_COLORS, PHOTO_MIN_COLORS, gridToLab, photoToDesign, type PixelGrid } from './pipeline'

const KNOWN = SPECIES.map((s) => s.id)
const SHRINK = shrinkageMap()

/** Три горизонтальные полосы: светлая, средняя, тёмная. Классический вход для проверки. */
function bandsGrid(cols = 12, rows = 9): PixelGrid {
  const rgba = new Uint8ClampedArray(cols * rows * 4)
  for (let row = 0; row < rows; row += 1) {
    const band = row < rows / 3 ? [235, 225, 200] : row < (2 * rows) / 3 ? [150, 95, 60] : [45, 35, 30]
    for (let col = 0; col < cols; col += 1) {
      const offset = (row * cols + col) * 4
      rgba[offset] = band[0] ?? 0
      rgba[offset + 1] = band[1] ?? 0
      rgba[offset + 2] = band[2] ?? 0
      rgba[offset + 3] = 255
    }
  }
  return { cols, rows, rgba }
}

describe('gridToLab', () => {
  it('переводит каждый пиксель', () => {
    const grid = bandsGrid(4, 4)
    const labs = gridToLab(grid)
    expect(labs).toHaveLength(16)
    expect(labs[0]?.L ?? 0).toBeGreaterThan(80)
    expect(labs[15]?.L ?? 100).toBeLessThan(30)
  })
})

describe('photoToDesign', () => {
  it('делает обычный изготовимый Design', () => {
    const result = photoToDesign(bandsGrid(), { colors: 3, panels: 3 })
    const diagnostics = validate(result.design, { shrinkageByPct: SHRINK, knownSpeciesIds: KNOWN })
    expect(hasErrors(diagnostics), JSON.stringify(diagnostics.filter((d) => d.level === 'error'))).toBe(false)
  })

  it('на трёх полосах и трёх щитах даёт ровно три панели', () => {
    const result = photoToDesign(bandsGrid(), { colors: 3, panels: 3 })
    expect(result.panelCount).toBe(3)
    expect(result.design.panels).toHaveLength(3)
  })

  it('число пород соответствует ползунку', () => {
    for (let colors = PHOTO_MIN_COLORS; colors <= PHOTO_MAX_COLORS; colors += 1) {
      const result = photoToDesign(bandsGrid(16, 12), { colors, panels: 4 })
      expect(result.species.length).toBeLessThanOrEqual(colors)
      expect(new Set(result.species).size).toBe(result.species.length)
    }
  })

  it('ползунок щитов действительно снижает число склеек', () => {
    const many = photoToDesign(bandsGrid(16, 12), { colors: 4, panels: 12 })
    const few = photoToDesign(bandsGrid(16, 12), { colors: 4, panels: 2 })
    expect(compile(few.design).glueUpCount).toBeLessThanOrEqual(compile(many.design).glueUpCount)
    expect(few.panelCount).toBeLessThanOrEqual(2)
  })

  it('светлая полоса сверху осталась светлой', () => {
    const result = photoToDesign(bandsGrid(), { colors: 3, panels: 3 })
    const model = compile(result.design)
    const topCell = model.cells.find((cell) => cell.yMm === 0)
    const bottomCell = [...model.cells].sort((a, b) => b.yMm - a.yMm)[0]
    expect(topCell).toBeDefined()
    expect(bottomCell).toBeDefined()
    expect(topCell?.speciesId).not.toBe(bottomCell?.speciesId)
  })

  it('детерминирована', () => {
    const grid = bandsGrid()
    expect(photoToDesign(grid, { colors: 4, panels: 5 })).toEqual(photoToDesign(grid, { colors: 4, panels: 5 }))
  })

  it('зажимает параметры вне допуска', () => {
    const result = photoToDesign(bandsGrid(), { colors: 99, panels: -4 })
    expect(result.species.length).toBeLessThanOrEqual(PHOTO_MAX_COLORS)
    expect(result.panelCount).toBeGreaterThanOrEqual(1)
  })

  it('однотонная картинка не роняет пайплайн', () => {
    const cols = 8
    const rows = 6
    const rgba = new Uint8ClampedArray(cols * rows * 4).fill(200)
    const result = photoToDesign({ cols, rows, rgba }, { colors: 4, panels: 3 })
    expect(hasErrors(validate(result.design, { shrinkageByPct: SHRINK, knownSpeciesIds: KNOWN }))).toBe(false)
    expect(result.design.panels.length).toBeGreaterThanOrEqual(1)
  })

  it('вырожденная сетка не роняет пайплайн', () => {
    const result = photoToDesign({ cols: 1, rows: 1, rgba: new Uint8ClampedArray([120, 90, 60, 255]) }, { colors: 3, panels: 2 })
    expect(hasErrors(validate(result.design, { shrinkageByPct: SHRINK, knownSpeciesIds: KNOWN }))).toBe(false)
  })

  it('имя документа берётся из параметров', () => {
    expect(photoToDesign(bandsGrid(), { colors: 3, panels: 3, name: 'Кот' }).design.name).toBe('Кот')
  })
})

/** Полностью прозрачная сетка: alpha=0 везде, RGB - произвольный мусор (как у пустого канваса). */
function transparentGrid(cols = 6, rows = 4): PixelGrid {
  const rgba = new Uint8ClampedArray(cols * rows * 4)
  for (let i = 0; i < cols * rows; i += 1) {
    rgba[i * 4] = 10
    rgba[i * 4 + 1] = 10
    rgba[i * 4 + 2] = 10
    rgba[i * 4 + 3] = 0
  }
  return { cols, rows, rgba }
}

describe('прозрачность', () => {
  it('полностью прозрачная картинка не роняет пайплайн и не красится в чёрный', () => {
    const result = photoToDesign(transparentGrid(), { colors: 3, panels: 2 })
    const diagnostics = validate(result.design, { shrinkageByPct: SHRINK, knownSpeciesIds: KNOWN })
    expect(hasErrors(diagnostics), JSON.stringify(diagnostics.filter((d) => d.level === 'error'))).toBe(false)
    // Все центроиды получены из белого фона, поэтому пород должно быть не больше одной.
    expect(result.species.length).toBeLessThanOrEqual(1)
  })

  /** Порода в клетке (col,row) прямо из документа, без компиляции геометрии. */
  function speciesAt(design: ReturnType<typeof photoToDesign>['design'], col: number, row: number): string | undefined {
    const rowSpec = design.rows[row]
    if (!rowSpec) return undefined
    const panel = design.panels.find((p) => p.id === rowSpec.panelId)
    const strip = panel?.elements[col]
    return strip?.kind === 'strip' ? strip.speciesId : undefined
  }

  it('прозрачная рамка вокруг цветного пятна не превращается в отдельный тёмный кластер', () => {
    const cols = 6
    const rows = 6
    const rgba = new Uint8ClampedArray(cols * rows * 4)
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const offset = (row * cols + col) * 4
        const inner = row >= 1 && row < rows - 1 && col >= 1 && col < cols - 1
        if (!inner) {
          // Прозрачная рамка: RGB нарочно чёрный, как отдаёт canvas для пустых пикселей.
          rgba[offset] = 0
          rgba[offset + 1] = 0
          rgba[offset + 2] = 0
          rgba[offset + 3] = 0
          continue
        }
        // Внутри - два непохожих пятна: светлое сверху, тёмное снизу, чтобы было с чем сравнивать.
        const dark = row >= rows / 2
        const color = dark ? [35, 25, 20] : [230, 210, 175]
        rgba[offset] = color[0] ?? 0
        rgba[offset + 1] = color[1] ?? 0
        rgba[offset + 2] = color[2] ?? 0
        rgba[offset + 3] = 255
      }
    }
    const result = photoToDesign({ cols, rows, rgba }, { colors: 2, panels: 3 })
    const cornerSpecies = speciesAt(result.design, 0, 0)
    const lightSpecies = speciesAt(result.design, 2, 1)
    const darkSpecies = speciesAt(result.design, 2, 4)
    expect(cornerSpecies).toBeDefined()
    expect(lightSpecies).toBeDefined()
    expect(darkSpecies).toBeDefined()
    // Прозрачная рамка должна была примкнуть к самому светлому кластеру, а не к тёмному пятну.
    expect(cornerSpecies).toBe(lightSpecies)
    expect(cornerSpecies).not.toBe(darkSpecies)
  })

  it('полупрозрачный пиксель компонуется на белый фон, а не остаётся тёмным', () => {
    const cols = 2
    const rows = 1
    const rgba = new Uint8ClampedArray(cols * rows * 4)
    // 50% прозрачности тёмного пикселя: должен посветлеть к белому, а не остаться тёмным как есть.
    rgba[0] = 20
    rgba[1] = 20
    rgba[2] = 20
    rgba[3] = 128
    rgba[4] = 20
    rgba[5] = 20
    rgba[6] = 20
    rgba[7] = 255
    const labs = gridToLab({ cols, rows, rgba })
    expect(labs[0]?.L ?? 0).toBeGreaterThan(labs[1]?.L ?? 100)
  })
})

describe('эвристика пригодности', () => {
  it('контрастные полосы не помечаются как рискованные', () => {
    const result = photoToDesign(bandsGrid(), { colors: 3, panels: 3 })
    expect(result.lowQuality).toBe(false)
  })

  it('мелкий шум помечается как рискованный', () => {
    const cols = 20
    const rows = 14
    const rgba = new Uint8ClampedArray(cols * rows * 4)
    for (let i = 0; i < cols * rows; i += 1) {
      // Псевдослучайный, но детерминированный шум без крупных пятен.
      const noise = (i * 2654435761) % 256
      rgba[i * 4] = noise
      rgba[i * 4 + 1] = (noise * 3) % 256
      rgba[i * 4 + 2] = (noise * 7) % 256
      rgba[i * 4 + 3] = 255
    }
    const result = photoToDesign({ cols, rows, rgba }, { colors: 3, panels: 4 })
    expect(result.lowQuality).toBe(true)
  })
})

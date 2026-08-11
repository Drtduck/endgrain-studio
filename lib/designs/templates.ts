import type { Design, Panel, Row, SpeciesId } from '@/lib/engine'
import type { MessageKey } from '@/lib/i18n'
import { GRID_ALLOWANCE_MM, GRID_KERF_MM, GRID_THICKNESS_MM, GRID_TRIM_MM, hash2, makeGridDesign, pick, uniform } from './grid'
import { DEFAULT_PLANER_WIDTH_MM } from '@/lib/engine'

export type TemplateGroup = 'checkerboard' | 'brick' | 'stripes' | 'chess' | 'special'

export interface BoardTemplate {
  readonly id: string
  readonly group: TemplateGroup
  readonly nameKey: MessageKey
  readonly build: () => Design
}

export const TEMPLATE_GROUPS: readonly TemplateGroup[] = ['checkerboard', 'brick', 'stripes', 'chess', 'special']

export function groupNameKey(group: TemplateGroup): MessageKey {
  return `tplGroup.${group}` as MessageKey
}

const DARK: SpeciesId = 'walnut'
const LIGHT: SpeciesId = 'maple'
const WARM: SpeciesId = 'cherry'
const ACCENT: SpeciesId = 'padauk'
const BLACK: SpeciesId = 'wenge'

/**
 * Все шаблоны строятся на прямом угле: движок сегодня умеет только angleDeg = 0,
 * поэтому chevron и ёлочки сюда сознательно не попали (validate отбил бы их с ANGLE_UNSUPPORTED).
 * «Диагонали» ниже - диагонали цвета по квадратной сетке, а не косые резы.
 */
function checkerboardClassic(): Design {
  return makeGridDesign({
    id: 'checkerboard-classic',
    name: 'Классическая шахматка',
    colWidthsMm: uniform(8, 30),
    rowHeightsMm: uniform(8, 30),
    at: (col, row) => ((col + row) % 2 === 0 ? DARK : LIGHT),
  })
}

function checkerboardFine(): Design {
  return makeGridDesign({
    id: 'checkerboard-fine',
    name: 'Мелкая шахматка',
    colWidthsMm: uniform(12, 25),
    rowHeightsMm: uniform(12, 25),
    at: (col, row) => ((col + row) % 2 === 0 ? DARK : LIGHT),
  })
}

function checkerboardThree(): Design {
  return makeGridDesign({
    id: 'checkerboard-three',
    name: 'Шахматка на три породы',
    colWidthsMm: uniform(9, 30),
    rowHeightsMm: uniform(9, 30),
    at: (col, row) => ((col + row) % 2 === 0 ? LIGHT : row % 4 < 2 ? DARK : ACCENT),
  })
}

function blocks2x2(): Design {
  return makeGridDesign({
    id: 'blocks-2x2',
    name: 'Крупные блоки',
    colWidthsMm: uniform(12, 25),
    rowHeightsMm: uniform(12, 25),
    at: (col, row) => ((Math.floor(col / 2) + Math.floor(row / 2)) % 2 === 0 ? LIGHT : DARK),
  })
}

function brickHalf(): Design {
  return makeGridDesign({
    id: 'brick-half',
    name: 'Кирпич вполовину',
    colWidthsMm: uniform(10, 30),
    rowHeightsMm: uniform(10, 30),
    // Кирпич в два блока со сдвигом на половину: нечётный ряд начинается с половинки.
    at: (col, row) => (Math.floor((col + (row % 2)) / 2) % 2 === 0 ? LIGHT : DARK),
  })
}

function brickThird(): Design {
  const palette: readonly SpeciesId[] = [LIGHT, DARK, WARM]
  return makeGridDesign({
    id: 'brick-third',
    name: 'Кирпич в треть',
    colWidthsMm: uniform(12, 25),
    rowHeightsMm: uniform(12, 25),
    at: (col, row) => pick(palette, Math.floor((col + (row % 3)) / 3) + row),
  })
}

function stripesWide(): Design {
  return makeGridDesign({
    id: 'stripes-wide',
    name: 'Широкие полосы',
    colWidthsMm: uniform(6, 50),
    rowHeightsMm: uniform(8, 30),
    at: (col) => (col % 2 === 0 ? LIGHT : DARK),
  })
}

function pinstripe(): Design {
  // Шесть пар «широкая полоса плюс кант»: 6 * (46 + 8) = 324 мм, впритык под рейсмус 330.
  const cols: number[] = []
  for (let i = 0; i < 6; i += 1) cols.push(46, 8)
  return makeGridDesign({
    id: 'pinstripe',
    name: 'Тонкий кант',
    colWidthsMm: cols,
    rowHeightsMm: uniform(8, 35),
    at: (col) => (col % 2 === 1 ? BLACK : LIGHT),
  })
}

function gradientStripes(): Design {
  const ramp: readonly SpeciesId[] = ['maple', 'ash', 'red-oak', 'cherry', 'walnut', 'wenge']
  return makeGridDesign({
    id: 'gradient-stripes',
    name: 'Градиент по светлоте',
    colWidthsMm: uniform(12, 25),
    rowHeightsMm: uniform(8, 30),
    // Зеркальная лесенка: светлое по краям, тёмное в середине.
    at: (col) => pick(ramp, col < 6 ? col : 11 - col),
  })
}

function diagonalLadder(): Design {
  const palette: readonly SpeciesId[] = [LIGHT, WARM, DARK, BLACK]
  return makeGridDesign({
    id: 'diagonal-ladder',
    name: 'Диагональ',
    colWidthsMm: uniform(8, 35),
    rowHeightsMm: uniform(12, 30),
    at: (col, row) => pick(palette, col + row),
  })
}

function diagonalFine(): Design {
  const palette: readonly SpeciesId[] = [LIGHT, ACCENT, DARK]
  return makeGridDesign({
    id: 'diagonal-fine',
    name: 'Мелкая диагональ',
    colWidthsMm: uniform(12, 25),
    rowHeightsMm: uniform(12, 25),
    at: (col, row) => pick(palette, col + row * 2),
  })
}

function accentRows(): Design {
  // Каждый третий ряд - тонкий поперечный акцент 8 мм.
  const rowsMm: number[] = []
  for (let i = 0; i < 4; i += 1) rowsMm.push(30, 30, 8)
  return makeGridDesign({
    id: 'accent-rows',
    name: 'Поперечный акцент',
    colWidthsMm: uniform(10, 30),
    rowHeightsMm: rowsMm,
    at: (col, row) => (row % 3 === 2 ? ACCENT : (col + row) % 2 === 0 ? LIGHT : DARK),
  })
}

function frameBorder(): Design {
  const size = 10
  return makeGridDesign({
    id: 'frame-border',
    name: 'Шахматка в рамке',
    colWidthsMm: uniform(size, 30),
    rowHeightsMm: uniform(size, 30),
    at: (col, row) => {
      const onBorder = col === 0 || row === 0 || col === size - 1 || row === size - 1
      if (onBorder) return BLACK
      return (col + row) % 2 === 0 ? LIGHT : DARK
    },
  })
}

function chess8x8(): Design {
  // Настоящее игровое поле: 8 клеток по 32 мм плюс бортик 20 мм с каждой стороны.
  const cols = [20, ...uniform(8, 32), 20]
  return makeGridDesign({
    id: 'chess-8x8',
    name: 'Шахматная доска 8 на 8',
    colWidthsMm: cols,
    rowHeightsMm: cols,
    at: (col, row) => {
      const onBorder = col === 0 || row === 0 || col === cols.length - 1 || row === cols.length - 1
      if (onBorder) return WARM
      return (col + row) % 2 === 0 ? LIGHT : DARK
    },
  })
}

function mosaicRandom(): Design {
  const palette: readonly SpeciesId[] = [LIGHT, WARM, DARK, ACCENT]
  return makeGridDesign({
    id: 'mosaic-random',
    name: 'Мозаика',
    colWidthsMm: uniform(10, 30),
    rowHeightsMm: uniform(10, 30),
    // Сид зашит: «случайный» узор обязан быть одинаковым у всех, иначе ссылка покажет другую доску.
    at: (col, row) => pick(palette, hash2(col, row, 1337)),
  })
}

/**
 * Единственный шаблон с SliceRef: центральная вставка - срез отдельной панели,
 * поэтому в середине доски ячейки вдвое мельче рядов. Глубина ровно 2, угол 0.
 */
export function makeInlayBand(): Design {
  const inner: Panel = {
    id: 'INNER',
    elements: Array.from({ length: 12 }, (_, i) => ({
      kind: 'strip' as const,
      speciesId: i % 2 === 0 ? ACCENT : LIGHT,
      widthMm: 15,
    })),
  }
  const main: Panel = {
    id: 'MAIN',
    elements: [
      { kind: 'strip', speciesId: LIGHT, widthMm: 60 },
      { kind: 'strip', speciesId: DARK, widthMm: 30 },
      { kind: 'sliceRef', panelId: 'INNER', thicknessMm: 90, angleDeg: 0, offsetMm: 0 },
      { kind: 'strip', speciesId: DARK, widthMm: 30 },
      { kind: 'strip', speciesId: LIGHT, widthMm: 60 },
    ],
  }
  const rows: Row[] = Array.from({ length: 8 }, (_, i) => ({
    id: `r${i}`,
    panelId: 'MAIN',
    thicknessMm: 30,
    angleDeg: 0,
    flip: false,
    mirror: false,
    trimMm: GRID_TRIM_MM,
  }))

  return {
    schemaVersion: 1,
    id: 'inlay-band',
    name: 'Вставка мелким срезом',
    species: [LIGHT, ACCENT, DARK],
    panels: [main, inner],
    rows,
    board: { targetWidthMm: 270, targetLengthMm: 240, thicknessMm: GRID_THICKNESS_MM },
    kerfMm: GRID_KERF_MM,
    planingAllowanceMm: GRID_ALLOWANCE_MM,
    planerWidthMm: DEFAULT_PLANER_WIDTH_MM,
  }
}

function template(id: string, group: TemplateGroup, build: () => Design): BoardTemplate {
  return { id, group, nameKey: `tpl.${id}` as MessageKey, build }
}

export const TEMPLATES: readonly BoardTemplate[] = [
  template('checkerboard-classic', 'checkerboard', checkerboardClassic),
  template('checkerboard-fine', 'checkerboard', checkerboardFine),
  template('checkerboard-three', 'checkerboard', checkerboardThree),
  template('blocks-2x2', 'checkerboard', blocks2x2),
  template('brick-half', 'brick', brickHalf),
  template('brick-third', 'brick', brickThird),
  template('stripes-wide', 'stripes', stripesWide),
  template('pinstripe', 'stripes', pinstripe),
  template('gradient-stripes', 'stripes', gradientStripes),
  template('diagonal-ladder', 'stripes', diagonalLadder),
  template('diagonal-fine', 'stripes', diagonalFine),
  template('accent-rows', 'stripes', accentRows),
  template('frame-border', 'chess', frameBorder),
  template('chess-8x8', 'chess', chess8x8),
  template('mosaic-random', 'special', mosaicRandom),
  template('inlay-band', 'special', makeInlayBand),
]

export function templateById(id: string): BoardTemplate | undefined {
  return TEMPLATES.find((tpl) => tpl.id === id)
}

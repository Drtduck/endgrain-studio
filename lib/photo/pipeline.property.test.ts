import { describe, it, expect } from 'vitest'
import { WARN_CELLS, compile, validate } from '@/lib/engine'
import { SPECIES, shrinkageMap } from '@/lib/species'
import { mulberry32 } from '@/lib/generators/random'
import { PHOTO_MAX_COLORS, PHOTO_MIN_COLORS, photoToDesign, type PixelGrid } from './pipeline'

const KNOWN = SPECIES.map((s) => s.id)
const SHRINK = shrinkageMap()

function randomGrid(seed: number, cols: number, rows: number): PixelGrid {
  const rnd = mulberry32(seed)
  const rgba = new Uint8ClampedArray(cols * rows * 4)
  for (let i = 0; i < cols * rows; i += 1) {
    rgba[i * 4] = Math.floor(rnd() * 256)
    rgba[i * 4 + 1] = Math.floor(rnd() * 256)
    rgba[i * 4 + 2] = Math.floor(rnd() * 256)
    rgba[i * 4 + 3] = 255
  }
  return { cols, rows, rgba }
}

describe('photoToDesign на случайных картинках', () => {
  it('никогда не выдаёт неизготовимую доску', () => {
    for (let seed = 0; seed < 25; seed += 1) {
      const cols = 4 + (seed % 21)
      const rows = 3 + (seed % 14)
      const grid = randomGrid(seed, cols, rows)
      for (let colors = PHOTO_MIN_COLORS; colors <= PHOTO_MAX_COLORS; colors += 1) {
        for (const panels of [1, 2, Math.ceil(rows / 2), rows]) {
          const result = photoToDesign(grid, { colors, panels })
          const errors = validate(result.design, { shrinkageByPct: SHRINK, knownSpeciesIds: KNOWN }).filter(
            (d) => d.level === 'error',
          )
          expect(errors, `сид ${seed}, цветов ${colors}, щитов ${panels}: ${JSON.stringify(errors)}`).toEqual([])
          const model = compile(result.design)
          expect(model.truncated).toBe(false)
          expect(model.cells.length).toBeLessThan(WARN_CELLS)
          expect(result.panelCount).toBeLessThanOrEqual(Math.max(1, Math.min(panels, rows)))
        }
      }
    }
  })
})

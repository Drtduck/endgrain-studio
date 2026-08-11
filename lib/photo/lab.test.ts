import { describe, it, expect } from 'vitest'
import { SPECIES } from '@/lib/species'
import { labDistance } from '@/lib/species/lab'
import { hexToLab, rgbToLab, srgbToLinear } from './lab'

describe('srgbToLinear', () => {
  it('линеаризует крайние точки', () => {
    expect(srgbToLinear(0)).toBeCloseTo(0, 6)
    expect(srgbToLinear(1)).toBeCloseTo(1, 6)
  })

  it('монотонен', () => {
    let previous = -1
    for (let i = 0; i <= 100; i += 1) {
      const value = srgbToLinear(i / 100)
      expect(value).toBeGreaterThan(previous)
      previous = value
    }
  })
})

describe('rgbToLab', () => {
  it('белый и чёрный на своих местах', () => {
    const white = rgbToLab(255, 255, 255)
    expect(white.L).toBeCloseTo(100, 2)
    expect(white.a).toBeCloseTo(0, 2)
    expect(white.b).toBeCloseTo(0, 2)
    const black = rgbToLab(0, 0, 0)
    expect(black.L).toBeCloseTo(0, 4)
  })

  it('совпадает со справочными значениями для чистых цветов', () => {
    const red = rgbToLab(255, 0, 0)
    expect(red.L).toBeCloseTo(53.24, 1)
    expect(red.a).toBeCloseTo(80.09, 1)
    expect(red.b).toBeCloseTo(67.2, 1)
    const green = rgbToLab(0, 255, 0)
    expect(green.L).toBeCloseTo(87.73, 1)
    const blue = rgbToLab(0, 0, 255)
    expect(blue.b).toBeCloseTo(-107.86, 1)
  })

  it('серые остаются нейтральными', () => {
    for (const value of [32, 96, 160, 224]) {
      const lab = rgbToLab(value, value, value)
      expect(Math.abs(lab.a)).toBeLessThan(0.5)
      expect(Math.abs(lab.b)).toBeLessThan(0.5)
    }
  })

  it('светлота растёт вместе с яркостью', () => {
    expect(rgbToLab(20, 20, 20).L).toBeLessThan(rgbToLab(200, 200, 200).L)
  })
})

describe('справочник пород согласован со своими hex', () => {
  it('заявленный LAB совпадает с пересчитанным из hex', () => {
    for (const species of SPECIES) {
      const computed = hexToLab(species.hex)
      expect(labDistance(computed, species.lab), `${species.id}: ${JSON.stringify(computed)}`).toBeLessThan(4)
    }
  })
})

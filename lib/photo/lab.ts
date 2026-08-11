import type { Lab } from '@/lib/species'

/** Обратная гамма sRGB. Без неё усреднение цветов фотографии врёт по светлоте. */
export function srgbToLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)
}

// Точка белого D65 в процентах.
const XN = 95.047
const YN = 100
const ZN = 108.883
const EPS = 216 / 24389
const KAPPA = 24389 / 27

function pivot(t: number): number {
  return t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116
}

/** sRGB (0..255) в CIELAB D65. Тот же расчёт, по которому собран справочник пород. */
export function rgbToLab(r: number, g: number, b: number): Lab {
  const lr = srgbToLinear(Math.max(0, Math.min(255, r)) / 255)
  const lg = srgbToLinear(Math.max(0, Math.min(255, g)) / 255)
  const lb = srgbToLinear(Math.max(0, Math.min(255, b)) / 255)

  const x = (0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) * 100
  const y = (0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb) * 100
  const z = (0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb) * 100

  const fx = pivot(x / XN)
  const fy = pivot(y / YN)
  const fz = pivot(z / ZN)

  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) }
}

export function hexToLab(hex: string): Lab {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match || match[1] === undefined) return { L: 50, a: 0, b: 0 }
  const value = Number.parseInt(match[1], 16)
  return rgbToLab((value >> 16) & 255, (value >> 8) & 255, value & 255)
}

export interface Rgb {
  readonly r: number
  readonly g: number
  readonly b: number
}

const HEX_RE = /^#([0-9a-f]{6})$/i

export function parseHex(hex: string): Rgb | null {
  const match = HEX_RE.exec(hex.trim())
  const digits = match?.[1]
  if (digits === undefined) return null
  const value = Number.parseInt(digits, 16)
  return {
    r: ((value >> 16) & 0xff) / 255,
    g: ((value >> 8) & 0xff) / 255,
    b: (value & 0xff) / 255,
  }
}

function channel(value: number): string {
  const byte = Math.round(Math.min(1, Math.max(0, value)) * 255)
  return byte.toString(16).padStart(2, '0')
}

export function toHex(rgb: Rgb): string {
  return `#${channel(rgb.r)}${channel(rgb.g)}${channel(rgb.b)}`
}

/**
 * Сдвиг тона к белому (amount > 0) или к чёрному (amount < 0).
 * Сдвиг линейный по каналу: для мелкой вариации торца этого достаточно,
 * а переход в LAB стоил бы дороже без видимой разницы на 6 процентах.
 */
export function shadeHex(hex: string, amount: number): string {
  const rgb = parseHex(hex)
  if (!rgb) return hex
  const k = Math.min(1, Math.max(-1, amount))
  const mix = (v: number): number => (k >= 0 ? v + (1 - v) * k : v * (1 + k))
  return toHex({ r: mix(rgb.r), g: mix(rgb.g), b: mix(rgb.b) })
}

/** Процедурная вариация торца: та же порода, но каждая ячейка чуть своего тона. */
export function jitteredHex(hex: string, jitter: number, amplitude = 0.07): string {
  return shadeHex(hex, Math.min(1, Math.max(-1, jitter)) * amplitude)
}

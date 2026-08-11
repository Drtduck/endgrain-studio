/**
 * Генератор псевдослучайных чисел mulberry32: 32 бита состояния, период 2^32.
 * Math.random в lib запрещён: узор обязан быть одинаковым у автора ссылки и у того,
 * кто её открыл, а на сервере и на клиенте первый рендер обязан совпасть до пикселя.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface Rng {
  next(): number
  int(maxExclusive: number): number
  range(min: number, max: number): number
  pick<T>(list: readonly T[]): T
  bool(probability?: number): boolean
  shuffled<T>(list: readonly T[]): T[]
}

export function makeRng(seed: number): Rng {
  const next = mulberry32(seed)
  const rng: Rng = {
    next,
    int(maxExclusive) {
      if (!Number.isFinite(maxExclusive) || maxExclusive <= 0) return 0
      return Math.floor(next() * maxExclusive)
    },
    range(min, max) {
      if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return min
      return min + next() * (max - min)
    },
    pick(list) {
      if (list.length === 0) throw new Error('pick вызван с пустым списком')
      const value = list[rng.int(list.length)]
      if (value === undefined) throw new Error('pick не нашёл элемент')
      return value
    },
    bool(probability = 0.5) {
      return next() < probability
    },
    shuffled(list) {
      const out = [...list]
      for (let i = out.length - 1; i > 0; i -= 1) {
        const j = rng.int(i + 1)
        const a = out[i]
        const b = out[j]
        if (a === undefined || b === undefined) continue
        out[i] = b
        out[j] = a
      }
      return out
    },
  }
  return rng
}

/**
 * Перемешивание сида с солью (финализатор murmur3). Нужно, чтобы разные части
 * одного узора (плитка, ширины, палитра) не шли из одного потока: иначе сдвиг
 * в одной части сдвигает все остальные, и «поменять только палитру» становится невозможно.
 */
export function mixSeed(seed: number, salt: number): number {
  let h = ((seed >>> 0) ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0
  return (h ^ (h >>> 16)) >>> 0
}

/** FNV-1a: строка в сид. Используется для стабильного сида по имени файла фотографии. */
export function seedFromString(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

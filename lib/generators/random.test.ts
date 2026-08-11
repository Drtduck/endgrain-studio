import { describe, it, expect } from 'vitest'
import { makeRng, mixSeed, mulberry32, seedFromString } from './random'

describe('mulberry32', () => {
  it('даёт один и тот же поток на одном сиде', () => {
    const a = mulberry32(12345)
    const b = mulberry32(12345)
    const first = Array.from({ length: 20 }, () => a())
    const second = Array.from({ length: 20 }, () => b())
    expect(first).toEqual(second)
  })

  it('на разных сидах потоки расходятся', () => {
    const a = mulberry32(1)
    const b = mulberry32(2)
    expect(a()).not.toBe(b())
  })

  it('держится в полуинтервале [0, 1)', () => {
    const rnd = mulberry32(7)
    for (let i = 0; i < 5000; i += 1) {
      const v = rnd()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('распределён достаточно равномерно, чтобы узор не слипался', () => {
    const rnd = mulberry32(99)
    const buckets = new Array<number>(10).fill(0)
    for (let i = 0; i < 10000; i += 1) {
      const index = Math.floor(rnd() * 10)
      const current = buckets[index] ?? 0
      buckets[index] = current + 1
    }
    for (const count of buckets) {
      expect(count).toBeGreaterThan(700)
      expect(count).toBeLessThan(1300)
    }
  })
})

describe('makeRng', () => {
  it('int не выходит за верхнюю границу и не уходит в минус', () => {
    const rng = makeRng(4)
    for (let i = 0; i < 1000; i += 1) {
      const v = rng.int(7)
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(7)
    }
    expect(rng.int(0)).toBe(0)
    expect(rng.int(-3)).toBe(0)
  })

  it('pick возвращает элемент списка', () => {
    const rng = makeRng(11)
    const list = ['a', 'b', 'c'] as const
    for (let i = 0; i < 100; i += 1) expect(list).toContain(rng.pick(list))
  })

  it('pick на пустом списке бросает, а не возвращает undefined', () => {
    expect(() => makeRng(1).pick([])).toThrow()
  })

  it('shuffled сохраняет состав и не трогает вход', () => {
    const source = [1, 2, 3, 4, 5, 6, 7, 8]
    const rng = makeRng(21)
    const out = rng.shuffled(source)
    expect(out).not.toBe(source)
    expect(source).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect([...out].sort((a, b) => a - b)).toEqual(source)
  })

  it('shuffled действительно перемешивает', () => {
    const source = Array.from({ length: 24 }, (_, i) => i)
    const out = makeRng(5).shuffled(source)
    expect(out).not.toEqual(source)
  })

  it('bool уважает вероятность', () => {
    const rng = makeRng(3)
    let hits = 0
    for (let i = 0; i < 2000; i += 1) if (rng.bool(0.25)) hits += 1
    expect(hits).toBeGreaterThan(350)
    expect(hits).toBeLessThan(650)
    expect(makeRng(3).bool(0)).toBe(false)
    expect(makeRng(3).bool(1)).toBe(true)
  })

  it('range попадает в заданный отрезок', () => {
    const rng = makeRng(8)
    for (let i = 0; i < 500; i += 1) {
      const v = rng.range(10, 20)
      expect(v).toBeGreaterThanOrEqual(10)
      expect(v).toBeLessThan(20)
    }
  })
})

describe('mixSeed', () => {
  it('возвращает uint32', () => {
    for (const [seed, salt] of [[0, 0], [1, 1], [4294967295, 17], [-5, 3]] as const) {
      const v = mixSeed(seed, salt)
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(4294967295)
    }
  })

  it('соседние соли дают некоррелированные потоки', () => {
    const a = makeRng(mixSeed(100, 0)).next()
    const b = makeRng(mixSeed(100, 1)).next()
    expect(Math.abs(a - b)).toBeGreaterThan(0.01)
  })

  it('детерминирован', () => {
    expect(mixSeed(42, 7)).toBe(mixSeed(42, 7))
  })
})

describe('seedFromString', () => {
  it('детерминирован и различает строки', () => {
    expect(seedFromString('walnut')).toBe(seedFromString('walnut'))
    expect(seedFromString('walnut')).not.toBe(seedFromString('maple'))
    expect(seedFromString('')).toBeGreaterThanOrEqual(0)
  })
})

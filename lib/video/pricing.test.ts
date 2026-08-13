import { describe, it, expect } from 'vitest'
import { isVideoSeconds, videoCostCents } from './pricing'

describe('videoCostCents', () => {
  it('5 секунд = 200 центов', () => {
    expect(videoCostCents(5)).toBe(200)
  })

  it('10 секунд = 400 центов', () => {
    expect(videoCostCents(10)).toBe(400)
  })

  it('0 секунд отбивается', () => {
    expect(videoCostCents(0)).toBeNull()
  })

  it('7 секунд отбивается: не входит в разрешённые длительности', () => {
    expect(videoCostCents(7)).toBeNull()
  })

  it('отрицательное и дробное отбивается', () => {
    expect(videoCostCents(-5)).toBeNull()
    expect(videoCostCents(5.5)).toBeNull()
  })
})

describe('isVideoSeconds', () => {
  it('признаёт только 5 и 10', () => {
    expect(isVideoSeconds(5)).toBe(true)
    expect(isVideoSeconds(10)).toBe(true)
    expect(isVideoSeconds(15)).toBe(false)
    expect(isVideoSeconds('5')).toBe(false)
  })
})

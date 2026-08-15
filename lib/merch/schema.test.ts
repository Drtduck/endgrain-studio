import { describe, expect, it } from 'vitest'
import { makeCheckerboard } from '@/lib/designs/samples'
import { merchOrderSchema } from './schema'

const design = makeCheckerboard()

function order(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    product: 'tshirt',
    size: 'm',
    projectId: null,
    design,
    ...overrides,
  }
}

describe('merchOrderSchema', () => {
  it('принимает валидный заказ футболки', () => {
    const parsed = merchOrderSchema.safeParse(order())
    expect(parsed.success).toBe(true)
  })

  it('принимает projectId как uuid', () => {
    const parsed = merchOrderSchema.safeParse(order({ projectId: '11111111-1111-4111-8111-111111111111' }))
    expect(parsed.success).toBe(true)
  })

  it('отбивает недопустимую пару кружка + размер L', () => {
    const parsed = merchOrderSchema.safeParse(order({ product: 'mug', size: 'l' }))
    expect(parsed.success).toBe(false)
  })

  it('отбивает недопустимую пару постер + размер S', () => {
    const parsed = merchOrderSchema.safeParse(order({ product: 'poster', size: 's' }))
    expect(parsed.success).toBe(false)
  })

  it('отбивает недопустимую пару фартук + размер XL', () => {
    const parsed = merchOrderSchema.safeParse(order({ product: 'apron', size: 'xl' }))
    expect(parsed.success).toBe(false)
  })

  it('принимает все допустимые размеры футболки', () => {
    for (const size of ['s', 'm', 'l', 'xl']) {
      expect(merchOrderSchema.safeParse(order({ size })).success).toBe(true)
    }
  })

  it('принимает size=one для кружки, постера и фартука', () => {
    for (const product of ['mug', 'poster', 'apron']) {
      expect(merchOrderSchema.safeParse(order({ product, size: 'one' })).success).toBe(true)
    }
  })

  it('отбивает неизвестный товар', () => {
    expect(merchOrderSchema.safeParse(order({ product: 'hoodie' })).success).toBe(false)
  })

  it('отбивает неизвестный размер', () => {
    expect(merchOrderSchema.safeParse(order({ size: 'xxl' })).success).toBe(false)
  })

  it('отбивает битый документ доски', () => {
    expect(merchOrderSchema.safeParse(order({ design: { ...design, panels: 'not-an-array' } })).success).toBe(false)
  })

  it('отбивает не-uuid projectId', () => {
    expect(merchOrderSchema.safeParse(order({ projectId: 'not-a-uuid' })).success).toBe(false)
  })
})

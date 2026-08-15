import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { round99, retailCents } from './pricing'

describe('round99', () => {
  it('округляет вверх до ближайшего X.99', () => {
    expect(round99(2431)).toBe(2499)
    expect(round99(2499)).toBe(2499)
    expect(round99(2500)).toBe(2599)
  })

  it('держит границы у нуля и у сотни', () => {
    expect(round99(99)).toBe(99)
    expect(round99(100)).toBe(199)
    expect(round99(0)).toBe(99)
  })
})

describe('retailCents (§2.1, формула round99(cost * margin + ship))', () => {
  it('наценка применяется только к печати, доставка добавляется по себестоимости', () => {
    // Футболка из §2.6 спеки: $9.50 печать * 1.8 + $4.70 доставка = $21.99.
    expect(retailCents({ costCents: 950, shipCents: 470 }, 1.8)).toBe(round99(Math.round(950 * 1.8) + 470))
    expect(retailCents({ costCents: 950, shipCents: 470 }, 1.8)).toBe(2199)
  })

  it('дорогая доставка не раздувает наценку сама на себя (постер из §2.6)', () => {
    expect(retailCents({ costCents: 1250, shipCents: 795 }, 1.8)).toBe(3099)
  })

  it('margin по умолчанию берётся из MERCH_MARGIN модуля', () => {
    expect(retailCents({ costCents: 950, shipCents: 470 })).toBe(retailCents({ costCents: 950, shipCents: 470 }, 1.8))
  })
})

describe('MERCH_MARGIN: защищённый разбор env (§10 спеки)', () => {
  const original = process.env['MERCH_MARGIN']

  beforeEach(() => {
    delete process.env['MERCH_MARGIN']
  })

  afterEach(() => {
    if (original === undefined) delete process.env['MERCH_MARGIN']
    else process.env['MERCH_MARGIN'] = original
    vi.resetModules()
  })

  it('без переменной берёт дефолт 1.8', async () => {
    const { MERCH_MARGIN } = await import('./pricing')
    expect(MERCH_MARGIN).toBe(1.8)
  })

  it('читает валидное переопределение', async () => {
    process.env['MERCH_MARGIN'] = '2.2'
    vi.resetModules()
    const { MERCH_MARGIN } = await import('./pricing')
    expect(MERCH_MARGIN).toBe(2.2)
  })

  it('мусор в env не должен продавать футболку за доллар: откат на дефолт', async () => {
    process.env['MERCH_MARGIN'] = 'not-a-number'
    vi.resetModules()
    const { MERCH_MARGIN } = await import('./pricing')
    expect(MERCH_MARGIN).toBe(1.8)
  })

  it('значение вне диапазона 1.0-5.0 тоже откатывается на дефолт', async () => {
    process.env['MERCH_MARGIN'] = '0.1'
    vi.resetModules()
    const low = await import('./pricing')
    expect(low.MERCH_MARGIN).toBe(1.8)

    vi.resetModules()
    process.env['MERCH_MARGIN'] = '9'
    const high = await import('./pricing')
    expect(high.MERCH_MARGIN).toBe(1.8)
  })
})

import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { CreditTransactionRow } from '@/lib/ai/credits'
import { CreditsHistory } from './CreditsHistory'

function row(overrides: Partial<CreditTransactionRow>): CreditTransactionRow {
  return {
    id: 'tx-1',
    kind: 'spend',
    amount: 0,
    balanceAfter: 0,
    feature: 'promoShots',
    createdAt: '2026-08-15T00:00:00.000Z',
    freeUnits: 0,
    creditUnits: 0,
    ...overrides,
  }
}

/**
 * Мелочь 3 (приёмка 15.08.2026): списание, целиком покрытое бесплатной
 * месячной квотой Pro, хранится в БД амаунтом 0 по дизайну (идемпотентность),
 * но история обязана показать реальное число нарисованных кадров со знаком
 * минус, а не "+0".
 */
describe('CreditsHistory: честное отображение списания (мелочь 3, приёмка 15.08.2026)', () => {
  it('spend, целиком покрытый бесплатной квотой (amount=0, freeUnits=1) - показывает -1', () => {
    render(<CreditsHistory locale="ru" items={[row({ amount: 0, freeUnits: 1, creditUnits: 0 })]} />)
    const item = screen.getByTestId('credits-history-tx-1')
    expect(item.textContent).toContain('-1')
    expect(item.textContent).not.toContain('+0')
  })

  it('spend, покрытый купленными кадрами (amount=-2) - показывает -2 как и раньше', () => {
    render(<CreditsHistory locale="ru" items={[row({ amount: -2, freeUnits: 0, creditUnits: 2 })]} />)
    expect(screen.getByTestId('credits-history-tx-1').textContent).toContain('-2')
  })

  it('spend смешанный (частично бесплатно, частично купленными) складывает оба поля', () => {
    render(<CreditsHistory locale="ru" items={[row({ amount: -1, freeUnits: 1, creditUnits: 1 })]} />)
    expect(screen.getByTestId('credits-history-tx-1').textContent).toContain('-2')
  })

  it('purchase остаётся положительным как раньше', () => {
    render(<CreditsHistory locale="ru" items={[row({ kind: 'purchase', amount: 20 })]} />)
    expect(screen.getByTestId('credits-history-tx-1').textContent).toContain('+20')
  })
})

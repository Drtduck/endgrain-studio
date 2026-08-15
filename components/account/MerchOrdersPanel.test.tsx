import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { MerchOrderView } from '@/lib/merch/orders'
import { MerchOrdersPanel } from './MerchOrdersPanel'

const BASE_ORDER: MerchOrderView = {
  id: 'order-1',
  product: 'tshirt',
  size: 'l',
  retailCents: 2199,
  status: 'paid',
  createdAt: '2026-08-01T00:00:00.000Z',
  printUrl: 'https://storage.example/order-1.png',
  shipEmail: 'buyer@example.com',
}

/**
 * «Мои заказы» (Э7, §7 спеки merch-orders.md). Компонент презентационный:
 * без похода в Supabase, страница передаёт готовые строки.
 */
describe('MerchOrdersPanel', () => {
  it('пустой список: честная строка вместо таблицы', () => {
    render(<MerchOrdersPanel orders={[]} locale="ru" />)
    expect(screen.getByTestId('merch-orders-empty')).toBeTruthy()
    expect(screen.queryByTestId('merch-orders-list')).toBeNull()
  })

  it('paid: текст статуса и «что дальше» человеческими словами', () => {
    render(<MerchOrdersPanel orders={[BASE_ORDER]} locale="ru" />)
    expect(screen.getByTestId('merch-order-status-order-1').textContent).toContain('печать')
    expect(screen.getByTestId('merch-order-next-order-1').textContent ?? '').not.toBe('')
  })

  it('draft_created: «что дальше» упоминает Printful и email получателя', () => {
    render(<MerchOrdersPanel orders={[{ ...BASE_ORDER, status: 'draft_created' }]} locale="ru" />)
    const next = screen.getByTestId('merch-order-next-order-1').textContent ?? ''
    expect(next).toContain('Printful')
    expect(next).toContain('buyer@example.com')
  })

  it('failed: текст объясняет заминку, не показывает код ошибки', () => {
    render(<MerchOrdersPanel orders={[{ ...BASE_ORDER, status: 'failed' }]} locale="ru" />)
    const next = screen.getByTestId('merch-order-next-order-1').textContent ?? ''
    expect(next).not.toBe('')
    expect(next).not.toContain('failed')
  })

  it('cancelled: текст про возврат денег', () => {
    render(<MerchOrdersPanel orders={[{ ...BASE_ORDER, status: 'cancelled' }]} locale="ru" />)
    expect(screen.getByTestId('merch-order-next-order-1').textContent ?? '').toContain('возвращ')
  })

  it('футболка показывает размер, товар с единственным размером - нет', () => {
    render(
      <MerchOrdersPanel
        orders={[BASE_ORDER, { ...BASE_ORDER, id: 'order-2', product: 'mug', size: 'one' }]}
        locale="ru"
      />,
    )
    expect(screen.getByTestId('merch-order-order-1').textContent).toContain('L')
    expect(screen.getByTestId('merch-order-order-2').textContent).not.toContain('ONE')
  })

  it('en: статусные тексты переведены и не пусты', () => {
    render(<MerchOrdersPanel orders={[{ ...BASE_ORDER, status: 'draft_created' }]} locale="en" />)
    const status = screen.getByTestId('merch-order-status-order-1').textContent ?? ''
    expect(status).not.toBe('')
    expect(status.toLowerCase()).not.toContain('готовим')
  })

  it('нет ссылки на print-файл: миниатюра не рендерится, карточка остаётся', () => {
    render(<MerchOrdersPanel orders={[{ ...BASE_ORDER, printUrl: null }]} locale="ru" />)
    expect(screen.queryByTestId('merch-order-thumb-order-1')).toBeNull()
    expect(screen.getByTestId('merch-order-order-1')).toBeTruthy()
  })
})

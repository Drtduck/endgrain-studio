import type { MerchProductId } from '../promo/types'
import type { MerchSize } from './catalog'

/**
 * Статусы, которые вообще видит человек в «Моих заказах» (§5.2, §7 спеки
 * merch-orders.md). pending_payment сюда не входит: это половина брошенных
 * корзин, показывать их значит пугать несуществующими долгами.
 */
export type MerchOrderStatus = 'paid' | 'draft_created' | 'failed' | 'cancelled'

/** Одна строка «Моих заказов», как её видит клиент. */
export interface MerchOrderView {
  readonly id: string
  readonly product: MerchProductId
  readonly size: MerchSize
  readonly retailCents: number
  readonly status: MerchOrderStatus
  readonly createdAt: string
  /** Публичная ссылка на print-файл для миниатюры. null, если Storage не отдал url. */
  readonly printUrl: string | null
  /** Email получателя из адреса Stripe: подставляется в текст статуса draft_created. */
  readonly shipEmail: string | null
}

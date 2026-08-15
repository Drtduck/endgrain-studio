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
  /** Публичная ссылка на полноразмерный print-файл (открывается по клику, не для миниатюры). */
  readonly printUrl: string | null
  /**
   * Публичная ссылка на превью 256px (ревью 15.08.2026, п.6): панель тянула
   * сам print-файл (до 4000px) под миниатюру 64x64 - лишние мегабайты ради
   * картинки размером с иконку. У заказов, оформленных до этой правки,
   * превью может не быть - тогда null, и панель показывает серый плейсхолдер.
   */
  readonly thumbUrl: string | null
  /** Email получателя из адреса Stripe: подставляется в текст статуса draft_created. */
  readonly shipEmail: string | null
}

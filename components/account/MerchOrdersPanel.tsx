import type { MerchOrderView } from '@/lib/merch/orders'
import { t, type Locale } from '@/lib/i18n'
import { MERCH_PRODUCTS } from '@/lib/promo/types'

const PRODUCT_TITLE_KEY = new Map(MERCH_PRODUCTS.map((p) => [p.id, p.titleKey] as const))

function formatDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale).format(new Date(iso))
}

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

/**
 * «Мои заказы» (§7 спеки merch-orders.md): чисто презентационный компонент,
 * страница app/account/orders/page.tsx читает readMerchOrdersAction() и
 * передаёт готовые строки сюда. Разделение ровно для того, чтобы карточку
 * и тексты статусов можно было проверить юнит-тестом без похода в Supabase.
 */
export function MerchOrdersPanel({ orders, locale }: { orders: readonly MerchOrderView[]; locale: Locale }) {
  if (orders.length === 0) {
    return (
      <p data-testid="merch-orders-empty" className="text-sm text-ink-secondary">
        {t(locale, 'merch.orders.empty')}
      </p>
    )
  }

  return (
    <ul data-testid="merch-orders-list" className="flex flex-col gap-3">
      {orders.map((order) => {
        const titleKey = PRODUCT_TITLE_KEY.get(order.product)
        const title = titleKey === undefined ? order.product : t(locale, titleKey)
        return (
          <li
            key={order.id}
            data-testid={`merch-order-${order.id}`}
            data-status={order.status}
            className="flex gap-3 rounded-lg border border-line-subtle bg-surface-raised p-3"
          >
            {order.printUrl === null ? null : (
              // Фон вместо <img>: миниатюра декоративная, текст рядом уже называет
              // товар и размер, а next/image потребовал бы завести домен Storage
              // в remotePatterns ради одной маленькой картинки в списке заказов.
              <div
                role="img"
                aria-label={title}
                data-testid={`merch-order-thumb-${order.id}`}
                style={{ backgroundImage: `url(${order.printUrl})` }}
                className="size-16 shrink-0 rounded-md border border-line-subtle bg-cover bg-center"
              />
            )}
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-sm font-semibold text-ink">
                {title}
                {order.size === 'one' ? null : ` · ${t(locale, 'merch.orders.size', { size: order.size.toUpperCase() })}`}
              </span>
              <span className="font-mono text-[11px] text-ink-muted tabular-nums">
                {t(locale, 'merch.orders.dateAmount', {
                  date: formatDate(order.createdAt, locale),
                  amount: formatUsd(order.retailCents),
                })}
              </span>
              <span data-testid={`merch-order-status-${order.id}`} className="text-[13px] font-semibold text-ink">
                {t(locale, `merch.orders.status.${order.status}`)}
              </span>
              <p data-testid={`merch-order-next-${order.id}`} className="text-[13px] text-ink-secondary">
                {t(locale, `merch.orders.next.${order.status}`, { email: order.shipEmail ?? '' })}
              </p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

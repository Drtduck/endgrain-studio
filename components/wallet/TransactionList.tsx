'use client'

import { t, type Locale, type MessageKey } from '@/lib/i18n'
import { formatCents } from '@/lib/wallet/format'
import type { WalletTransactionRow } from '@/lib/wallet/server'

const KIND_KEYS: Readonly<Record<WalletTransactionRow['kind'], MessageKey>> = {
  topup: 'wallet.tx.topup',
  spend: 'wallet.tx.spend',
  refund: 'wallet.tx.refund',
}

export function TransactionList({ locale, items }: { readonly locale: Locale; readonly items: readonly WalletTransactionRow[] }) {
  if (items.length === 0) {
    return (
      <p data-testid="wallet-tx-empty" className="text-[13px] text-ink-secondary">
        {t(locale, 'wallet.tx.empty')}
      </p>
    )
  }

  const dateFormatter = new Intl.DateTimeFormat(locale)

  return (
    <ul data-testid="wallet-tx-list" className="flex flex-col gap-1.5">
      {items.map((tx) => (
        <li
          key={tx.id}
          data-testid={`wallet-tx-${tx.id}`}
          className="flex items-center justify-between gap-2 rounded-md border border-line-subtle bg-surface-raised px-3 py-2 text-[13px]"
        >
          <span className="text-ink-secondary">
            {t(locale, KIND_KEYS[tx.kind])} · {dateFormatter.format(new Date(tx.createdAt))}
          </span>
          <span className={tx.amountCents >= 0 ? 'font-mono font-semibold text-success-text' : 'font-mono font-semibold text-ink'}>
            {tx.amountCents >= 0 ? '+' : ''}
            {formatCents(tx.amountCents, locale)}
          </span>
        </li>
      ))}
    </ul>
  )
}

'use client'

import { t, type Locale, type MessageKey } from '@/lib/i18n'
import type { CreditTransactionRow } from '@/lib/ai/credits'

const KIND_KEYS: Readonly<Record<CreditTransactionRow['kind'], MessageKey>> = {
  purchase: 'credits.tx.purchase',
  grant: 'credits.tx.grant',
  spend: 'credits.tx.spend',
  refund: 'credits.tx.refund',
}

/** История движений кадров. По образцу components/wallet/TransactionList.tsx. */
export function CreditsHistory({ locale, items }: { readonly locale: Locale; readonly items: readonly CreditTransactionRow[] }) {
  if (items.length === 0) {
    return (
      <p data-testid="credits-history-empty" className="text-[13px] text-ink-secondary">
        {t(locale, 'wallet.tx.empty')}
      </p>
    )
  }

  const dateFormatter = new Intl.DateTimeFormat(locale)

  return (
    <ul data-testid="credits-history-list" className="flex flex-col gap-1.5">
      {items.map((tx) => (
        <li
          key={tx.id}
          data-testid={`credits-history-${tx.id}`}
          className="flex items-center justify-between gap-2 rounded-md border border-line-subtle bg-surface-raised px-3 py-2 text-[13px]"
        >
          <span className="text-ink-secondary">
            {t(locale, KIND_KEYS[tx.kind])} · {dateFormatter.format(new Date(tx.createdAt))}
          </span>
          <span className={tx.amount >= 0 ? 'font-mono font-semibold text-success-text' : 'font-mono font-semibold text-ink'}>
            {tx.amount >= 0 ? '+' : ''}
            {tx.amount}
          </span>
        </li>
      ))}
    </ul>
  )
}

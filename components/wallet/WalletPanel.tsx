'use client'

import { useEffect, useState, useTransition } from 'react'
import { Wallet } from 'lucide-react'
import { createTopUpCheckoutAction, readWalletAction, type WalletCheckoutError, type WalletView } from '@/app/actions/wallet'
import { TopUpButtons } from '@/components/wallet/TopUpButtons'
import { TransactionList } from '@/components/wallet/TransactionList'
import { t, type Locale, type MessageKey } from '@/lib/i18n'
import { formatCents, type WalletPreset } from '@/lib/wallet/format'

const ERROR_KEYS: Readonly<Record<WalletCheckoutError, MessageKey>> = {
  invalid: 'wallet.error',
  disabled: 'wallet.disabled',
  unauthenticated: 'wallet.error',
  failed: 'wallet.error',
}

const EMPTY: WalletView = { balanceCents: 0, transactions: [] }

/**
 * Баланс кошелька в аккаунте. Читается серверным действием при монтировании
 * (пассивно, без polling): после успешного пополнения человек возвращается
 * с Checkout по success_url на ту же страницу, а перечитать баланс по кнопке
 * можно и вручную, поэтому кэш не устаревает надолго.
 */
export function WalletPanel({ locale }: { readonly locale: Locale }) {
  const [wallet, setWallet] = useState<WalletView>(EMPTY)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState<WalletPreset | null>(null)
  const [error, setError] = useState<WalletCheckoutError | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let alive = true
    void readWalletAction().then((res) => {
      if (alive) {
        setWallet(res)
        setLoaded(true)
      }
    })
    return () => {
      alive = false
    }
  }, [])

  const onTopUp = (preset: WalletPreset): void => {
    setError(null)
    setBusy(preset)
    startTransition(async () => {
      const res = await createTopUpCheckoutAction(preset)
      if (res.ok) {
        window.location.href = res.url
        return
      }
      setError(res.error)
      setBusy(null)
    })
  }

  return (
    <section
      data-testid="wallet-panel"
      aria-label={t(locale, 'wallet.title')}
      className="flex flex-col gap-3 rounded-lg border border-line-subtle bg-surface-raised p-4"
    >
      <div className="flex items-center gap-2">
        <Wallet aria-hidden className="size-4 shrink-0 text-ink-secondary" />
        <h3 className="text-sm font-semibold">{t(locale, 'wallet.title')}</h3>
        <div className="flex-1" />
        <span data-testid="wallet-balance" className="font-mono text-base font-semibold tabular-nums">
          {loaded ? formatCents(wallet.balanceCents, locale) : '—'}
        </span>
      </div>

      <p className="text-[13px] text-ink-secondary">{t(locale, 'wallet.subtitle')}</p>

      <TopUpButtons locale={locale} busy={pending ? busy : null} onPick={onTopUp} />

      {error ? (
        <p role="alert" data-testid="wallet-error" className="text-[13px] text-error-text">
          {t(locale, ERROR_KEYS[error])}
        </p>
      ) : null}

      {loaded && wallet.transactions.length > 0 ? (
        <>
          <h4 className="mt-1 text-[11px] font-medium tracking-[0.12em] text-ink-muted uppercase">
            {t(locale, 'wallet.tx.title')}
          </h4>
          <TransactionList locale={locale} items={wallet.transactions} />
        </>
      ) : null}
    </section>
  )
}

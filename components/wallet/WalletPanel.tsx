'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
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

/** Ключ sessionStorage для сверки баланса до ухода на Checkout, по образцу CreditsPanel. */
const BEFORE_KEY = 'egs_wallet_before'
const POLL_ATTEMPTS = 8
const POLL_INTERVAL_MS = 1500

type ToastState = { readonly kind: 'pending' } | { readonly kind: 'done'; readonly amountCents: number } | { readonly kind: 'slow' } | { readonly kind: 'cancel' } | null

/**
 * Баланс кошелька в аккаунте. Читается серверным действием при монтировании
 * (пассивно, без polling): после успешного пополнения человек возвращается
 * с Checkout по success_url на ту же страницу, а перечитать баланс по кнопке
 * можно и вручную, поэтому кэш не устаревает надолго.
 */
export function WalletPanel({ locale }: { readonly locale: Locale }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [wallet, setWallet] = useState<WalletView>(EMPTY)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState<WalletPreset | null>(null)
  const [error, setError] = useState<WalletCheckoutError | null>(null)
  const [toast, setToast] = useState<ToastState>(null)
  const [pending, startTransition] = useTransition()
  const pollingStarted = useRef(false)

  const load = (): void => {
    void readWalletAction().then((res) => {
      setWallet(res)
      setLoaded(true)
    })
  }

  useEffect(() => {
    load()
  }, [])

  // Возврат с Checkout: ?wallet=success/cancel, тот же механизм, что в
  // CreditsPanel (раздел 7.4 спеки pricing-wallet.md), только сверяет balanceCents.
  useEffect(() => {
    const walletParam = searchParams.get('wallet')
    if (walletParam === null || pathname === null) return
    if (pollingStarted.current) return
    pollingStarted.current = true

    // setState откладываем микротаском: react-hooks/set-state-in-effect не
    // разрешает звать его синхронно из тела эффекта, ровно как в CreditsPanel.
    if (walletParam === 'cancel') {
      void Promise.resolve().then(() => setToast({ kind: 'cancel' }))
      router.replace(pathname)
      return
    }

    if (walletParam !== 'success') {
      router.replace(pathname)
      return
    }

    void Promise.resolve().then(() => setToast({ kind: 'pending' }))
    const beforeRaw = typeof window === 'undefined' ? null : window.sessionStorage.getItem(BEFORE_KEY)
    const before = beforeRaw === null ? -1 : Number(beforeRaw)

    let attempt = 0
    let alive = true
    const poll = (): void => {
      if (!alive) return
      void readWalletAction().then((res) => {
        if (!alive) return
        attempt += 1
        if (res.balanceCents > before) {
          setWallet(res)
          setToast({ kind: 'done', amountCents: res.balanceCents - Math.max(before, 0) })
          window.sessionStorage.removeItem(BEFORE_KEY)
          return
        }
        if (attempt >= POLL_ATTEMPTS) {
          setToast({ kind: 'slow' })
          return
        }
        setTimeout(poll, POLL_INTERVAL_MS)
      })
    }
    poll()

    router.replace(pathname)
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onTopUp = (preset: WalletPreset): void => {
    setError(null)
    setBusy(preset)
    if (typeof window !== 'undefined') window.sessionStorage.setItem(BEFORE_KEY, String(wallet.balanceCents))
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

  const onRefresh = (): void => {
    setToast(null)
    load()
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
          {loaded ? formatCents(wallet.balanceCents, locale) : '-'}
        </span>
      </div>

      <p className="text-[13px] text-ink-secondary">{t(locale, 'wallet.subtitle')}</p>

      {toast === null ? null : (
        <div className="flex flex-col gap-1.5 rounded-md border border-line-subtle bg-app px-3 py-2 text-[13px]">
          {toast.kind === 'pending' ? <p data-testid="wallet-toast-pending">{t(locale, 'wallet.toast.pending')}</p> : null}
          {toast.kind === 'done' ? (
            <p data-testid="wallet-toast-done">{t(locale, 'wallet.toast.done', { amount: formatCents(toast.amountCents, locale) })}</p>
          ) : null}
          {toast.kind === 'slow' ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p data-testid="wallet-toast-slow">{t(locale, 'wallet.toast.slow')}</p>
              <button type="button" data-testid="wallet-refresh" onClick={onRefresh} className="text-accent hover:underline">
                {t(locale, 'credits.refresh')}
              </button>
            </div>
          ) : null}
          {toast.kind === 'cancel' ? <p data-testid="wallet-toast-cancel">{t(locale, 'wallet.toast.cancel')}</p> : null}
        </div>
      )}

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

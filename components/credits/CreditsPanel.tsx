'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Coins } from 'lucide-react'
import { createPackCheckoutAction, readCreditsAction, type CreditsView, type PackCheckoutError } from '@/app/actions/credits'
import { CreditsHistory } from '@/components/credits/CreditsHistory'
import { PackCard } from '@/components/credits/PackCard'
import { t, type Locale, type MessageKey } from '@/lib/i18n'
import { AI_PACKS, type AiPackId } from '@/lib/ai/packs'

const ERROR_KEYS: Readonly<Record<PackCheckoutError, MessageKey>> = {
  invalid: 'credits.error',
  disabled: 'credits.disabled',
  unauthenticated: 'credits.error',
  failed: 'credits.error',
}

const EMPTY: CreditsView = { credits: 0, freeRemaining: 0, freeLimit: 0, totalRemaining: 0, transactions: [] }

/** Ключ sessionStorage для сверки баланса до ухода на Checkout. */
const BEFORE_KEY = 'egs_frames_before'
/** До 8 попыток каждые 1500мс: см. раздел 7.4 спеки pricing-wallet.md. */
const POLL_ATTEMPTS = 8
const POLL_INTERVAL_MS = 1500

type ToastState =
  | { readonly kind: 'pending' }
  | { readonly kind: 'done'; readonly frames: number }
  | { readonly kind: 'slow' }
  | { readonly kind: 'cancel' }
  | null

/**
 * Экран покупки пакетов кадров + счётчик остатка. Живёт на /account/billing
 * (components/credits/CreditsPanel.tsx, раздел 6-7 спеки pricing-wallet.md).
 */
export function CreditsPanel({ locale }: { readonly locale: Locale }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [view, setView] = useState<CreditsView>(EMPTY)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState<AiPackId | null>(null)
  const [error, setError] = useState<PackCheckoutError | null>(null)
  const [toast, setToast] = useState<ToastState>(null)
  const [pending, startTransition] = useTransition()
  const pollingStarted = useRef(false)

  const load = (): void => {
    void readCreditsAction().then((res) => {
      setView(res)
      setLoaded(true)
    })
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    const packParam = searchParams.get('pack')
    if (packParam === null || pathname === null) return
    if (pollingStarted.current) return
    pollingStarted.current = true

    // Обработка ?pack= идёт только один раз на монтирование (эффект без
    // зависимостей от searchParams/pathname/router - их читаем только тут,
    // повторный запуск при их смене не нужен и опасен: cleanup ниже валит
    // alive у ещё идущего опроса). setState откладываем микротаском, чтобы
    // не звать его синхронно из тела эффекта (react-hooks/set-state-in-effect).
    if (packParam === 'cancel') {
      void Promise.resolve().then(() => setToast({ kind: 'cancel' }))
      router.replace(pathname)
      return
    }

    if (packParam !== 'success') {
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
      void readCreditsAction().then((res) => {
        if (!alive) return
        attempt += 1
        if (res.credits > before) {
          setView(res)
          setToast({ kind: 'done', frames: res.credits - Math.max(before, 0) })
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

  const onBuy = (packId: AiPackId): void => {
    setError(null)
    setBusy(packId)
    if (typeof window !== 'undefined') window.sessionStorage.setItem(BEFORE_KEY, String(view.credits))
    startTransition(async () => {
      const res = await createPackCheckoutAction(packId)
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
    <section data-testid="credits-panel" aria-label={t(locale, 'credits.title')} className="flex flex-col gap-3">
      <header className="flex items-center gap-2">
        <Coins aria-hidden className="size-4 shrink-0 text-ink-secondary" />
        <h3 className="text-sm font-semibold">{t(locale, 'credits.title')}</h3>
        <div className="flex-1" />
        <span data-testid="credits-total" className="font-mono text-base font-semibold tabular-nums">
          {loaded ? t(locale, 'credits.total', { remaining: view.totalRemaining }) : '-'}
        </span>
      </header>

      <p data-testid="credits-split" className="text-[13px] text-ink-secondary">
        {loaded ? t(locale, 'ai.quota', { remaining: view.totalRemaining, free: view.freeRemaining, credits: view.credits }) : ''}
      </p>

      {toast === null ? null : (
        <div className="flex flex-col gap-1.5 rounded-md border border-line-subtle bg-surface-raised px-3 py-2 text-[13px]">
          {toast.kind === 'pending' ? <p data-testid="credits-toast-pending">{t(locale, 'credits.toast.pending')}</p> : null}
          {toast.kind === 'done' ? (
            <p data-testid="credits-toast-done">{t(locale, 'credits.toast.done', { frames: toast.frames })}</p>
          ) : null}
          {toast.kind === 'slow' ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p data-testid="credits-toast-slow">{t(locale, 'credits.toast.slow')}</p>
              <button
                type="button"
                data-testid="credits-refresh"
                onClick={onRefresh}
                className="text-accent hover:underline"
              >
                {t(locale, 'credits.refresh')}
              </button>
            </div>
          ) : null}
          {toast.kind === 'cancel' ? <p data-testid="credits-toast-cancel">{t(locale, 'credits.toast.cancel')}</p> : null}
        </div>
      )}

      <div data-testid="credits-packs" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {AI_PACKS.map((pack, index) => (
          <PackCard
            key={pack.id}
            locale={locale}
            pack={pack}
            index={index}
            busy={pending && busy === pack.id}
            disabled={pending}
            onBuy={() => onBuy(pack.id)}
          />
        ))}
      </div>

      {error ? (
        <p role="alert" data-testid="credits-error" className="text-[13px] text-error-text">
          {t(locale, ERROR_KEYS[error])}
        </p>
      ) : null}

      {loaded && view.transactions.length > 0 ? (
        <>
          <h4 className="mt-1 text-[11px] font-medium tracking-[0.12em] text-ink-muted uppercase">{t(locale, 'credits.history')}</h4>
          <CreditsHistory locale={locale} items={view.transactions} />
        </>
      ) : null}
    </section>
  )
}


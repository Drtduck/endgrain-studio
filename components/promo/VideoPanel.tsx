'use client'

import { useState } from 'react'
import { Clapperboard } from 'lucide-react'
import { generateVideoAction, type VideoError, type VideoResult } from '@/app/actions/video'
import { boardPngDataUrl } from '@/components/promo/boardPng'
import { useSession } from '@/components/SessionProvider'
import { Button } from '@/components/ui/button'
import { t, type MessageKey } from '@/lib/i18n'
import { useDerived } from '@/lib/store/derived'
import { useStudio } from '@/lib/store/studio'
import { VIDEO_ALLOWED_SECONDS, videoCostCents, type VideoSeconds } from '@/lib/video/pricing'
import { formatCents } from '@/lib/wallet/format'

const ERROR_KEYS: Readonly<Record<VideoError, MessageKey>> = {
  unauthenticated: 'video.error.unauthenticated',
  invalid: 'video.error.failed',
  insufficient: 'video.error.insufficient',
  unavailable: 'video.error.failed',
  failed: 'video.error.failed',
}

/**
 * Ролик из узора доски. Ключа fal.ai нет, поэтому генерация замокана: мок
 * возвращает постер-заглушку и списывает кошелёк ровно так, как списался бы
 * настоящий вызов. Гейт это баланс, не Pro: за ролик уже платят живыми деньгами.
 */
export function VideoPanel() {
  const locale = useStudio((s) => s.locale)
  const { model } = useDerived()
  const { user } = useSession()
  const [seconds, setSeconds] = useState<VideoSeconds>(5)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<VideoResult | null>(null)

  const cost = videoCostCents(seconds) ?? 0

  const run = async (): Promise<void> => {
    setBusy(true)
    setResult(null)
    try {
      const boardPng = await boardPngDataUrl(model)
      setResult(await generateVideoAction(seconds, boardPng))
    } catch (err) {
      console.error(err)
      setResult({ ok: false, error: 'failed' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      data-testid="promo-video"
      aria-label={t(locale, 'video.title')}
      className="flex flex-col gap-4 rounded-lg border border-line-subtle bg-surface p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-[17px] font-semibold">{t(locale, 'video.title')}</h2>
        <div className="flex-1" />
        <div className="inline-flex rounded-md bg-surface-sunken p-0.5" role="group" aria-label={t(locale, 'video.duration')}>
          {VIDEO_ALLOWED_SECONDS.map((s) => (
            <button
              key={s}
              type="button"
              data-testid={`video-seconds-${s}`}
              onClick={() => setSeconds(s)}
              className={
                s === seconds
                  ? 'rounded-sm bg-surface-raised px-2.5 py-1 font-mono text-xs shadow-sm'
                  : 'rounded-sm px-2.5 py-1 font-mono text-xs text-ink-secondary'
              }
            >
              {s}s
            </button>
          ))}
        </div>
        <Button
          size="sm"
          data-testid="video-generate"
          disabled={busy || !user}
          onClick={() => {
            void run()
          }}
        >
          <Clapperboard data-icon="inline-start" />
          {busy ? t(locale, 'video.busy') : t(locale, 'video.generate', { cost: formatCents(cost, locale) })}
        </Button>
      </div>

      <p className="max-w-[68ch] text-[13px] text-ink-secondary">{t(locale, 'video.subtitle', { cost: formatCents(cost, locale) })}</p>

      {!user ? (
        <p data-testid="video-gate" className="text-[13px] text-ink-secondary">
          {t(locale, 'video.error.unauthenticated')}
        </p>
      ) : null}

      {result !== null && !result.ok ? (
        <p role="alert" data-testid="video-error" className="rounded-md border border-error-border bg-error-soft px-3 py-[11px] text-[13px] font-semibold text-error-text">
          {t(locale, ERROR_KEYS[result.error])}
        </p>
      ) : null}

      {result?.ok === true ? (
        <div data-testid="video-result" className="flex flex-col gap-2">
          {result.mock ? (
            <p data-testid="video-mock-note" className="text-[13px] text-ink-secondary">
              {t(locale, 'video.mockNote')}
            </p>
          ) : null}
          <img src={result.posterUrl} alt={t(locale, 'video.title')} className="max-w-xs rounded-md border border-line-subtle" />
          <p data-testid="video-balance" className="text-[13px] text-ink-secondary">
            {t(locale, 'wallet.title')}: {formatCents(result.balanceCents, locale)}
          </p>
        </div>
      ) : null}
    </section>
  )
}

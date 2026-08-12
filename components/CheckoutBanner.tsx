'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { t, type Locale } from '@/lib/i18n'

export type CheckoutState = 'success' | 'cancel'

/**
 * Текст успеха честно предупреждает про задержку вебхука: между возвратом из
 * кассы и записью в базу проходит от долей секунды до нескольких секунд.
 * Никакого поллинга и router.refresh() по таймеру: одна честная фраза дешевле.
 */
export function CheckoutBanner({ state, locale = 'ru' }: { state: CheckoutState; locale?: Locale }) {
  const [open, setOpen] = useState(true)
  if (!open) return null

  const success = state === 'success'
  return (
    <div
      data-testid="checkout-banner"
      role="status"
      className={
        success
          ? 'flex items-start gap-3 border-b border-accent-border bg-accent-soft px-4 py-3'
          : 'flex items-start gap-3 border-b border-line bg-surface-raised px-4 py-3'
      }
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-semibold text-ink">
          {t(locale, success ? 'checkout.successTitle' : 'checkout.cancelTitle')}
        </span>
        <span className="text-[13px] text-ink-secondary">
          {t(locale, success ? 'checkout.successBody' : 'checkout.cancelBody')}
        </span>
      </div>
      <div className="flex-1" />
      <Button
        variant="ghost"
        size="sm"
        data-testid="checkout-banner-close"
        aria-label={t(locale, 'checkout.dismiss')}
        onClick={() => setOpen(false)}
      >
        <X />
      </Button>
    </div>
  )
}

'use client'

import { useState, useTransition } from 'react'
import { CreditCard } from 'lucide-react'
import { createPurchaseCheckoutAction } from '@/app/actions/gallery'
import type { GalleryError } from '@/lib/gallery/types'
import { formatPrice } from '@/lib/gallery/price'
import { Button } from '@/components/ui/button'
import { t, type Locale, type MessageKey } from '@/lib/i18n'

const ERROR_KEYS: Readonly<Record<GalleryError, MessageKey>> = {
  unauthenticated: 'gallery.purchaseErrorAuth',
  invalid: 'gallery.purchaseError',
  notFound: 'gallery.purchaseError',
  failed: 'gallery.purchaseError',
  limit: 'gallery.purchaseError',
  needsPurchase: 'gallery.purchaseError',
  disabled: 'gallery.purchaseErrorDisabled',
  own: 'gallery.purchaseErrorOwn',
  already: 'gallery.purchaseErrorAlready',
}

/**
 * «Купить за $X»: живая покупка платного чужого некупленного проекта
 * (фаза 2 спеки docs/superpowers/specs/2026-08-13-commerce-social-design.md).
 * Уходит на Stripe Checkout и не возвращается сама - после оплаты Stripe
 * приводит человека обратно на success_url этой же страницы, где сервер
 * уже увидит купленную работу через hasPurchased.
 */
export function PurchaseButton({
  locale,
  publishedId,
  priceCents,
}: {
  readonly locale: Locale
  readonly publishedId: string
  readonly priceCents: number
}) {
  const [error, setError] = useState<GalleryError | null>(null)
  const [pending, startTransition] = useTransition()

  const onBuy = (): void => {
    setError(null)
    startTransition(async () => {
      const res = await createPurchaseCheckoutAction(publishedId)
      if (res.ok) {
        window.location.href = res.url
        return
      }
      setError(res.error)
    })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Button size="sm" data-testid="gallery-purchase" disabled={pending} onClick={onBuy}>
        <CreditCard data-icon="inline-start" />
        {pending ? t(locale, 'gallery.purchaseBusy') : t(locale, 'gallery.purchase', { price: formatPrice(priceCents, locale) })}
      </Button>
      {error ? (
        <p role="alert" data-testid="gallery-purchase-error" className="text-[13px] text-error-text">
          {t(locale, ERROR_KEYS[error])}
        </p>
      ) : null}
    </div>
  )
}

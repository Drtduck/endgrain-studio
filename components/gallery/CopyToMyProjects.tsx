'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Copy } from 'lucide-react'
import { copyPublishedAction } from '@/app/actions/gallery'
import type { GalleryError } from '@/lib/gallery/types'
import { Button } from '@/components/ui/button'
import { t, type Locale, type MessageKey } from '@/lib/i18n'

const ERROR_KEYS: Readonly<Record<GalleryError, MessageKey>> = {
  unauthenticated: 'gallery.copyErrorAuth',
  invalid: 'gallery.copyError',
  notFound: 'gallery.copyError',
  failed: 'gallery.copyError',
  limit: 'gallery.copyErrorLimit',
  needsPurchase: 'gallery.copyErrorPaid',
}

/**
 * «Сохранить себе»: копия в свои проекты, для бесплатной публикации сразу.
 * У платного проекта эта кнопка не рендерится вовсе - её место занимает
 * задизейбленная «скоро» из PurchaseButton (см. страницу проекта галереи).
 */
export function CopyToMyProjects({ locale, publishedId }: { readonly locale: Locale; readonly publishedId: string }) {
  const router = useRouter()
  const [error, setError] = useState<GalleryError | null>(null)
  const [done, setDone] = useState(false)
  const [pending, startTransition] = useTransition()

  const onCopy = (): void => {
    setError(null)
    startTransition(async () => {
      const res = await copyPublishedAction(publishedId)
      if (res.ok) {
        setDone(true)
        router.refresh()
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Button size="sm" data-testid="gallery-copy" disabled={pending || done} onClick={onCopy}>
        <Copy data-icon="inline-start" />
        {done ? t(locale, 'gallery.copied') : pending ? t(locale, 'gallery.copyBusy') : t(locale, 'gallery.copy')}
      </Button>
      {error ? (
        <p role="alert" data-testid="gallery-copy-error" className="text-[13px] text-error-text">
          {t(locale, ERROR_KEYS[error])}
        </p>
      ) : null}
    </div>
  )
}

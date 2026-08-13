'use client'

import { useState, useTransition } from 'react'
import { Share2 } from 'lucide-react'
import { publishProjectAction } from '@/app/actions/gallery'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { GalleryError } from '@/lib/gallery/types'
import { t, type Locale, type MessageKey } from '@/lib/i18n'

const ERROR_KEYS: Readonly<Record<GalleryError, MessageKey>> = {
  unauthenticated: 'gallery.publishErrorAuth',
  invalid: 'gallery.publishErrorInvalid',
  notFound: 'gallery.publishErrorInvalid',
  failed: 'gallery.publishError',
  limit: 'gallery.publishErrorLimit',
  needsPurchase: 'gallery.publishError',
}

/**
 * Публикация проекта из «Мои проекты» в галерею. Разворачивается инлайн под
 * строкой проекта: название и цена в долларах (0 значит бесплатно), по
 * publishProjectAction. Полноценный модальный диалог тут избыточен - форма
 * из двух полей, а базовые компоненты диалога в проекте уже заняты под ForkDialog.
 */
export function PublishDialog({ locale, projectId, defaultTitle }: { readonly locale: Locale; readonly projectId: string; readonly defaultTitle: string }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(defaultTitle)
  const [price, setPrice] = useState('0')
  const [error, setError] = useState<GalleryError | null>(null)
  const [done, setDone] = useState(false)
  const [pending, startTransition] = useTransition()

  if (!open) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" data-testid={`gallery-publish-open-${projectId}`} onClick={() => setOpen(true)}>
          <Share2 data-icon="inline-start" />
          {t(locale, 'gallery.publishOpen')}
        </Button>
        {done ? (
          <span data-testid={`gallery-publish-done-${projectId}`} className="text-[13px] text-success-text">
            {t(locale, 'gallery.publishDone')}
          </span>
        ) : null}
      </div>
    )
  }

  const onPublish = (): void => {
    setError(null)
    startTransition(async () => {
      const res = await publishProjectAction(projectId, title, price)
      if (res.ok) {
        setDone(true)
        setOpen(false)
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border border-line-subtle bg-surface p-2" data-testid={`gallery-publish-form-${projectId}`}>
      <div className="flex flex-col gap-1">
        <label htmlFor={`gallery-publish-title-${projectId}`} className="text-[11px] text-ink-muted">
          {t(locale, 'gallery.publishTitle')}
        </label>
        <Input
          id={`gallery-publish-title-${projectId}`}
          data-testid={`gallery-publish-title-${projectId}`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={pending}
          className="w-48"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`gallery-publish-price-${projectId}`} className="text-[11px] text-ink-muted">
          {t(locale, 'gallery.publishPrice')}
        </label>
        <Input
          id={`gallery-publish-price-${projectId}`}
          data-testid={`gallery-publish-price-${projectId}`}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          disabled={pending}
          inputMode="decimal"
          className="w-24"
        />
      </div>
      <Button size="sm" data-testid={`gallery-publish-submit-${projectId}`} disabled={pending} onClick={onPublish}>
        {pending ? t(locale, 'gallery.publishBusy') : t(locale, 'gallery.publishSubmit')}
      </Button>
      <Button size="sm" variant="ghost" data-testid={`gallery-publish-cancel-${projectId}`} disabled={pending} onClick={() => setOpen(false)}>
        {t(locale, 'gallery.publishCancel')}
      </Button>
      {error ? (
        <p role="alert" data-testid={`gallery-publish-error-${projectId}`} className="w-full text-[13px] text-error-text">
          {t(locale, ERROR_KEYS[error])}
        </p>
      ) : null}
    </div>
  )
}

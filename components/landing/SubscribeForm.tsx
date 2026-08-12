'use client'

import { useState, useTransition } from 'react'
import { subscribeAction } from '@/app/actions/subscribe'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EMAIL_MAX_LENGTH, type SubscribeResult } from '@/lib/subscribe'
import { t, type Locale, type MessageKey } from '@/lib/i18n'

type SubscribeError = Extract<SubscribeResult, { ok: false }>['error']
// 'bot' сюда не попадает намеренно: ответ боту неотличим от успеха на уровне UI,
// настоящая ошибка ('invalid' | 'disabled' | 'failed') всегда получает свой ключ.
type VisibleError = Exclude<SubscribeError, 'bot'>

const ERROR_KEYS: Readonly<Record<VisibleError, MessageKey>> = {
  invalid: 'landing.subscribe.errInvalid',
  disabled: 'landing.subscribe.errDisabled',
  failed: 'landing.subscribe.errFailed',
}

export function SubscribeForm({ locale }: { locale: Locale }) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<VisibleError | null>(null)
  const [pending, startTransition] = useTransition()

  const onSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    setError(null)
    const form = e.currentTarget
    const company = (new FormData(form).get('company') ?? '').toString()
    startTransition(async () => {
      const res = await subscribeAction({ email, locale, company })
      if (res.ok) {
        setSent(true)
        setEmail('')
        return
      }
      if (res.error === 'bot') {
        setSent(true)
        setEmail('')
        return
      }
      setError(res.error)
    })
  }

  if (sent) {
    return (
      <p data-testid="subscribe-sent" className="text-sm text-ink">
        {t(locale, 'landing.subscribe.sent')}
      </p>
    )
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2.5" noValidate>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="email"
          required
          maxLength={EMAIL_MAX_LENGTH}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t(locale, 'landing.subscribe.placeholder')}
          disabled={pending}
          data-testid="subscribe-email"
          aria-label={t(locale, 'landing.subscribe.title')}
          className="sm:flex-1"
        />
        {/* Ловушка для ботов: не display:none, часть ботов такие поля пропускает. */}
        <input
          type="text"
          name="company"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="absolute h-0 w-0 opacity-0"
        />
        <Button type="submit" disabled={pending} data-testid="subscribe-submit">
          {pending ? t(locale, 'landing.subscribe.busy') : t(locale, 'landing.subscribe.submit')}
        </Button>
      </div>

      {error ? (
        <p role="alert" data-testid="subscribe-error" className="text-sm text-error-text">
          {t(locale, ERROR_KEYS[error])}
        </p>
      ) : null}
    </form>
  )
}

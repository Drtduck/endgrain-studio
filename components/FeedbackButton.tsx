'use client'

import { useState, useTransition } from 'react'
import { MessageSquarePlus } from 'lucide-react'
import { submitFeedbackAction, type FeedbackResult } from '@/app/actions/feedback'
import { Button, buttonVariants } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { FEEDBACK_MAX_LENGTH } from '@/lib/feedback'
import { t, type MessageKey } from '@/lib/i18n'
import { useStudio } from '@/lib/store/studio'

type FeedbackError = Extract<FeedbackResult, { ok: false }>['error']

const ERROR_KEYS: Readonly<Record<FeedbackError, MessageKey>> = {
  empty: 'feedback.errorEmpty',
  tooLong: 'feedback.errorTooLong',
  disabled: 'feedback.errorDisabled',
  failed: 'feedback.errorFailed',
}

export function FeedbackButton() {
  const locale = useStudio((s) => s.locale)
  const [body, setBody] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<FeedbackError | null>(null)
  const [pending, startTransition] = useTransition()

  const onSubmit = (): void => {
    const text = body.trim()
    if (text.length === 0) {
      setError('empty')
      return
    }
    setError(null)
    // Маршрут собираем в момент отправки: хэш содержит закодированный
    // документ и в базу ему не надо, берём только pathname + search.
    const route = window.location.pathname + window.location.search
    startTransition(async () => {
      const res = await submitFeedbackAction({ body: text, route, locale })
      if (res.ok) {
        setBody('')
        setSent(true)
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <Popover onOpenChange={(open) => { if (open) setSent(false) }}>
      <PopoverTrigger
        data-testid="feedback-button"
        aria-label={t(locale, 'feedback.open')}
        className={buttonVariants({ variant: 'default', size: 'icon', className: 'fixed right-4 bottom-4 z-40 rounded-full shadow-lg' })}
      >
        <MessageSquarePlus />
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-[320px]">
        <div className="flex flex-col gap-2.5">
          <h3 className="text-sm font-semibold">{t(locale, 'feedback.title')}</h3>
          <p className="text-[13px] leading-normal text-ink-secondary">{t(locale, 'feedback.hint')}</p>

          {sent ? (
            <p data-testid="feedback-sent" className="text-sm text-ink">
              {t(locale, 'feedback.sent')}
            </p>
          ) : (
            <>
              <Textarea
                data-testid="feedback-text"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={FEEDBACK_MAX_LENGTH}
                placeholder={t(locale, 'feedback.placeholder')}
                disabled={pending}
              />
              <div className="flex items-center justify-between">
                <span data-testid="feedback-counter" className="font-mono text-[11px] text-ink-muted tabular-nums">
                  {t(locale, 'feedback.counter', { used: body.length, max: FEEDBACK_MAX_LENGTH })}
                </span>
                <Button
                  size="sm"
                  data-testid="feedback-submit"
                  onClick={onSubmit}
                  disabled={pending || body.trim().length === 0}
                >
                  {pending ? t(locale, 'feedback.busy') : t(locale, 'feedback.submit')}
                </Button>
              </div>

              {error ? (
                <p role="alert" data-testid="feedback-error" className="text-sm text-error-text">
                  {t(locale, ERROR_KEYS[error], { max: FEEDBACK_MAX_LENGTH })}
                </p>
              ) : null}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

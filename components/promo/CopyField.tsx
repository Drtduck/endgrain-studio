'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { t, type Locale } from '@/lib/i18n'

/**
 * Одно поле карточки товара плюс своя кнопка «Скопировать». Человек переносит
 * поля в разные поля чужой админки (Amazon, Etsy), поэтому общая кнопка на всю
 * карточку тут бесполезна: каждое поле копируется отдельно.
 */
export function CopyField({
  locale,
  label,
  value,
  testId,
  multiline = false,
}: {
  readonly locale: Locale
  readonly label: string
  readonly value: string
  readonly testId: string
  readonly multiline?: boolean
}) {
  const [copied, setCopied] = useState(false)

  const copy = (): void => {
    navigator.clipboard
      ?.writeText(value)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => {
        // Буфер обмена недоступен - молча остаёмся без успеха, ничего не ломаем.
      })
  }

  return (
    <div className="flex flex-col gap-1" data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium tracking-[0.12em] text-ink-muted uppercase">{label}</span>
        <Button size="sm" variant="ghost" data-testid={`${testId}-copy`} onClick={copy}>
          {copied ? <Check data-icon="inline-start" className="text-success-text" /> : <Copy data-icon="inline-start" />}
          {t(locale, copied ? 'salePrep.copied' : 'salePrep.copy')}
        </Button>
      </div>
      {multiline ? (
        <p data-testid={`${testId}-value`} className="rounded-md border border-line-subtle bg-surface-raised p-2 text-[13px] whitespace-pre-wrap">
          {value}
        </p>
      ) : (
        <p data-testid={`${testId}-value`} className="rounded-md border border-line-subtle bg-surface-raised p-2 text-[13px]">
          {value}
        </p>
      )}
    </div>
  )
}

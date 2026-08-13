'use client'

import { useState } from 'react'
import { Tag } from 'lucide-react'
import { generateListingAction, type ListingError, type ListingResult } from '@/app/actions/listing'
import { AiGateNote, useAiGate } from '@/components/promo/AiGate'
import { CopyField } from '@/components/promo/CopyField'
import { Button } from '@/components/ui/button'
import { t, type MessageKey } from '@/lib/i18n'
import { selectDesign, useStudio } from '@/lib/store/studio'

const ERROR_KEYS: Readonly<Record<ListingError, MessageKey>> = {
  anonymous: 'ai.gate.anonymous',
  notPro: 'ai.gate.free',
  quota: 'ai.gate.quota',
  unavailable: 'ai.gate.unavailable',
  invalid: 'salePrep.error',
  failed: 'salePrep.error',
}

/**
 * Карточка товара для Amazon и Etsy: заголовок, буллеты, теги, описание,
 * материалы, уход. Каждое поле со своей кнопкой копирования, потому что
 * их разносят по разным полям чужой админки.
 */
export function ListingPanel() {
  const locale = useStudio((s) => s.locale)
  const design = useStudio(selectDesign)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ListingResult | null>(null)
  const gate = useAiGate()

  const run = (): void => {
    setBusy(true)
    setResult(null)
    generateListingAction(design)
      .then(setResult)
      .catch((err: unknown) => {
        console.error(err)
        setResult({ ok: false, error: 'failed' })
      })
      .finally(() => setBusy(false))
  }

  const listing = result?.ok === true ? result.listing : null

  return (
    <section
      data-testid="promo-listing"
      aria-label={t(locale, 'salePrep.title')}
      className="flex flex-col gap-4 rounded-lg border border-line-subtle bg-surface p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-[17px] font-semibold">{t(locale, 'salePrep.title')}</h2>
        <div className="flex-1" />
        <Button size="sm" data-testid="listing-generate" disabled={busy || gate.locked} onClick={run}>
          <Tag data-icon="inline-start" />
          {busy ? t(locale, 'salePrep.busy') : t(locale, 'salePrep.generate')}
        </Button>
      </div>

      <p className="max-w-[68ch] text-[13px] text-ink-secondary">{t(locale, 'salePrep.subtitle')}</p>

      {gate.locked ? <AiGateNote gate={gate} locale={locale} testId="listing-gate" /> : null}

      {result !== null && !result.ok ? (
        <p role="alert" data-testid="listing-error" className="rounded-md border border-error-border bg-error-soft px-3 py-[11px] text-[13px] font-semibold text-error-text">
          {t(locale, ERROR_KEYS[result.error])}
        </p>
      ) : null}

      {result?.ok === true && result.mock ? (
        <p data-testid="listing-mock-note" className="text-[13px] text-ink-secondary">
          {t(locale, 'salePrep.mockNote')}
        </p>
      ) : null}

      {listing !== null ? (
        <div className="flex flex-col gap-3" data-testid="listing-result">
          <CopyField locale={locale} label={t(locale, 'salePrep.field.title')} value={listing.title} testId="listing-field-title" />
          <CopyField
            locale={locale}
            label={t(locale, 'salePrep.field.bullets')}
            value={listing.bullets.map((line) => `- ${line}`).join('\n')}
            testId="listing-field-bullets"
            multiline
          />
          <CopyField
            locale={locale}
            label={t(locale, 'salePrep.field.keywords')}
            value={listing.keywords.join(', ')}
            testId="listing-field-keywords"
            multiline
          />
          <CopyField
            locale={locale}
            label={t(locale, 'salePrep.field.description')}
            value={listing.description}
            testId="listing-field-description"
            multiline
          />
          <CopyField
            locale={locale}
            label={t(locale, 'salePrep.field.materials')}
            value={listing.materials.join('\n')}
            testId="listing-field-materials"
            multiline
          />
          <CopyField locale={locale} label={t(locale, 'salePrep.field.care')} value={listing.care} testId="listing-field-care" multiline />
        </div>
      ) : null}
    </section>
  )
}

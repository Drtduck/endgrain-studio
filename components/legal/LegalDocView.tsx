import Link from 'next/link'
import type { ReactNode } from 'react'
import type { LegalDoc } from '@/lib/legal'
import { t, type Locale } from '@/lib/i18n'

function formatDate(iso: string, locale: Locale): string {
  return new Date(iso).toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-US')
}

/**
 * Один общий серверный компонент рендерит все три правовых документа: страницы
 * в app/legal (privacy, personal-data, consent) только выбирают документ и локаль.
 * Юридическая проза живёт в lib/legal/, поэтому сам компонент не содержит
 * захардкоженного текста и не попадает под барьер lib/i18n/purity.test.ts благодаря
 * тому, что кириллица приезжает данными, а не литералом в разметке.
 */
export function LegalDocView({
  doc,
  locale,
  children,
}: {
  doc: LegalDoc
  locale: Locale
  children?: ReactNode
}) {
  return (
    <main className="min-h-screen bg-app px-4 py-10">
      <div className="mx-auto flex max-w-3xl flex-col gap-6" data-testid="legal-doc">
        <Link href="/" data-testid="legal-back" className="text-[13px] text-accent hover:underline">
          {t(locale, 'app.title')}
        </Link>

        <div className="flex flex-col gap-1">
          <h1 data-testid="legal-title" className="font-display text-3xl font-semibold tracking-tight text-ink">
            {doc.title}
          </h1>
          <p data-testid="legal-updated-at" className="text-xs text-ink-muted">
            {t(locale, 'legal.updatedAt', { date: formatDate(doc.updatedAt, locale) })}
          </p>
        </div>

        <div className="flex flex-col gap-6">
          {doc.sections.map((section, i) => (
            <section key={i} data-testid="legal-section" className="flex flex-col gap-2">
              <h2 className="font-display text-lg font-semibold text-ink">{section.heading}</h2>
              {section.paragraphs.map((paragraph, j) => (
                <p key={j} className="text-[14px] leading-relaxed text-ink-secondary">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>

        {children}
      </div>
    </main>
  )
}

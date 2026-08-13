import type { Metadata } from 'next'
import { ConsentSettings } from '@/components/ConsentSettings'
import { LegalDocView } from '@/components/legal/LegalDocView'
import { t } from '@/lib/i18n'
import { getLandingLocale } from '@/lib/landing/locale'
import { LEGAL_DOCS } from '@/lib/legal'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLandingLocale()
  return { title: LEGAL_DOCS.privacy[locale].title }
}

export default async function PrivacyPage() {
  const locale = await getLandingLocale()
  const doc = LEGAL_DOCS.privacy[locale]
  return (
    <>
      <LegalDocView doc={doc} locale={locale} />
      <div className="mx-auto -mt-2 flex max-w-3xl flex-col gap-2 px-4 pb-16">
        <h2 className="font-display text-lg font-semibold text-ink">{t(locale, 'consent.settings.title')}</h2>
        <ConsentSettings locale={locale} />
      </div>
    </>
  )
}

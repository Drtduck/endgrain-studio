import type { Metadata } from 'next'
import { LandingHeader } from '@/components/landing/LandingHeader'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { getLandingLocale } from '@/lib/landing/locale'
import { t } from '@/lib/i18n'

export const metadata: Metadata = { title: 'Endgrain Studio' } // расширяется в задаче 5

export default async function LandingPage() {
  const locale = await getLandingLocale()
  return (
    <>
      <LandingHeader locale={locale} />
      <main data-testid="landing" className="flex flex-col">
        <p className="px-6 py-24 text-center font-display text-3xl">{t(locale, 'landing.hero.title')}</p>
      </main>
      <LandingFooter locale={locale} />
    </>
  )
}

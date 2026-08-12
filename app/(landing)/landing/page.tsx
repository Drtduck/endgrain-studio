import type { Metadata } from 'next'
import { LandingHeader } from '@/components/landing/LandingHeader'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { LandingHero } from '@/components/landing/LandingHero'
import { PatternMarquee } from '@/components/landing/PatternMarquee'
import { FeatureGrid } from '@/components/landing/FeatureGrid'
import { HowItWorks } from '@/components/landing/HowItWorks'
import { ShotStrip } from '@/components/landing/ShotStrip'
import { getLandingLocale } from '@/lib/landing/locale'
import { t } from '@/lib/i18n'
import { APP_ORIGIN } from '@/lib/routing/host'

export const metadata: Metadata = { title: 'Endgrain Studio' } // расширяется в задаче 5

export default async function LandingPage() {
  const locale = await getLandingLocale()

  return (
    <>
      <LandingHeader locale={locale} />
      <main data-testid="landing" className="flex flex-col">
        <LandingHero locale={locale} />

        <section id="patterns" className="scroll-mt-14 bg-canvas px-6 pt-16 pb-2" data-testid="landing-patterns">
          <div className="mx-auto max-w-5xl text-center">
            <h2 className="font-display text-3xl tracking-tight text-ink">{t(locale, 'landing.patterns.title')}</h2>
            <p className="mx-auto mt-3 max-w-[60ch] text-ink-secondary">{t(locale, 'landing.patterns.body')}</p>
          </div>
        </section>
        <PatternMarquee locale={locale} />

        <FeatureGrid locale={locale} />
        <HowItWorks locale={locale} />
        <ShotStrip locale={locale} />

        <section className="bg-app px-6 py-24" data-testid="landing-final-cta">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 text-center">
            <h2 className="font-display text-3xl tracking-tight text-ink sm:text-4xl">{t(locale, 'landing.finalCta.title')}</h2>
            <p className="max-w-[52ch] text-ink-secondary">{t(locale, 'landing.finalCta.body')}</p>
            <a
              href={APP_ORIGIN}
              data-testid="landing-cta-final"
              className="rounded-md bg-accent px-6 py-3 font-sans text-base font-semibold text-accent-fg shadow-sm transition-colors duration-hover hover:bg-accent-hover"
            >
              {t(locale, 'landing.hero.ctaPrimary')}
            </a>
          </div>
        </section>
      </main>
      <LandingFooter locale={locale} />
    </>
  )
}

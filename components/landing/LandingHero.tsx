import { t, type Locale } from '@/lib/i18n'
import { APP_SIGNUP_URL } from '@/lib/routing/host'
import { speciesHex } from '@/lib/species'

// Четыре полосы-породы для декоративной сетки фона. Цвета берутся из движка пород
// (единственное разрешённое исключение из запрета на сырые hex), а не придумываются заново.
const BACKDROP_SPECIES = ['walnut', 'padauk', 'maple', 'wenge'] as const

export function LandingHero({ locale }: { locale: Locale }) {
  const title = t(locale, 'landing.hero.title')
  const accent = t(locale, 'landing.hero.accent')
  const [before, after] = title.split(accent)

  return (
    <section className="relative overflow-hidden bg-app px-6 py-20 sm:py-28" data-testid="landing-hero">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        {BACKDROP_SPECIES.map((id, i) => (
          <div
            key={id}
            className="absolute h-[140%] w-24 -rotate-12 opacity-[0.07]"
            style={{ backgroundColor: speciesHex(id), left: `${8 + i * 22}%`, top: '-20%' }}
          />
        ))}
      </div>

      <div className="mx-auto grid max-w-5xl items-center gap-10 md:grid-cols-2">
        <div className="flex flex-col items-start gap-6">
          <h1 className="font-display text-[clamp(40px,7vw,84px)] leading-[1.02] tracking-tight text-ink">
            {before}
            <span className="text-accent">{accent}</span>
            {after}
          </h1>

          <p className="max-w-[52ch] font-sans text-lg text-ink-secondary">{t(locale, 'landing.hero.subtitle')}</p>

          <div className="flex flex-wrap items-center gap-3">
            <a
              href={APP_SIGNUP_URL}
              data-testid="landing-cta-hero"
              className="rounded-md bg-accent px-5 py-3 font-sans text-base font-semibold text-accent-fg shadow-sm transition-colors duration-hover hover:bg-accent-hover"
            >
              {t(locale, 'landing.hero.ctaPrimary')}
            </a>
            <a
              href="#patterns"
              data-testid="landing-cta-patterns"
              className="rounded-md border border-line bg-surface px-5 py-3 font-sans text-base font-semibold text-ink transition-colors duration-hover hover:bg-app"
            >
              {t(locale, 'landing.hero.ctaSecondary')}
            </a>
          </div>

          <p className="font-sans text-sm text-ink-muted">{t(locale, 'landing.hero.trust')}</p>
        </div>

        <div className="flex items-center justify-center">
          <img
            src="/brand/beaver-logo.svg"
            width={380}
            height={380}
            alt={t(locale, 'landing.hero.mascotAlt')}
            className="eg-bob w-full max-w-[380px]"
          />
        </div>
      </div>
    </section>
  )
}

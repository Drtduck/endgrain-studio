import { ShotLightbox } from '@/components/landing/ShotLightbox'
import { SHOTS } from '@/lib/landing/shots'
import { t, type Locale, type MessageKey } from '@/lib/i18n'

// Снимаются через `pnpm shots` (e2e/shots.spec.ts) и коммитятся как обычные файлы.
// Комплект свой на каждую локаль: интерфейс на снимке должен совпадать с языком лендинга.

export function ShotStrip({ locale }: { locale: Locale }) {
  const shots = SHOTS.map((shot) => ({
    slug: shot.slug,
    src: `/landing/shots/${locale}/${shot.file}`,
    label: t(locale, `landing.shots.alt.${shot.slug}` as MessageKey),
  }))

  return (
    <section className="bg-surface px-6 py-20" data-testid="landing-shots">
      <div className="mx-auto max-w-5xl">
        <h2 className="mb-2 font-display text-3xl tracking-tight text-ink">{t(locale, 'landing.shots.title')}</h2>
        <p className="mb-6 max-w-[60ch] text-sm text-ink-secondary">{t(locale, 'landing.shots.hint')}</p>

        <ShotLightbox locale={locale} shots={shots} />
      </div>
    </section>
  )
}

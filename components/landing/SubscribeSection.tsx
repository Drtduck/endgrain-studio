import { SubscribeForm } from '@/components/landing/SubscribeForm'
import { t, type Locale } from '@/lib/i18n'

export function SubscribeSection({ locale }: { locale: Locale }) {
  return (
    <section className="bg-app px-6 py-16" data-testid="landing-subscribe">
      <div className="mx-auto max-w-2xl rounded-lg border border-accent-border bg-accent-soft p-6 sm:p-8">
        <h2 className="font-display text-2xl tracking-tight text-ink">{t(locale, 'landing.subscribe.title')}</h2>
        <p className="mt-2 max-w-[52ch] text-ink-secondary">{t(locale, 'landing.subscribe.body')}</p>

        <div className="mt-5">
          <SubscribeForm locale={locale} />
        </div>

        <p className="mt-3 text-xs text-ink-muted">{t(locale, 'landing.subscribe.note')}</p>
      </div>
    </section>
  )
}

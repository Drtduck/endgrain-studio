import { t, type Locale, type MessageKey } from '@/lib/i18n'

const STEPS: readonly { key: string; titleKey: MessageKey; bodyKey: MessageKey }[] = [
  { key: 's1', titleKey: 'landing.how.s1.title', bodyKey: 'landing.how.s1.body' },
  { key: 's2', titleKey: 'landing.how.s2.title', bodyKey: 'landing.how.s2.body' },
  { key: 's3', titleKey: 'landing.how.s3.title', bodyKey: 'landing.how.s3.body' },
  { key: 's4', titleKey: 'landing.how.s4.title', bodyKey: 'landing.how.s4.body' },
]

export function HowItWorks({ locale }: { locale: Locale }) {
  return (
    <section className="bg-app px-6 py-20" data-testid="landing-how">
      <div className="mx-auto max-w-5xl">
        <h2 className="mb-10 font-display text-3xl tracking-tight text-ink">{t(locale, 'landing.how.title')}</h2>

        <ol className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ key, titleKey, bodyKey }, i) => (
            <li key={key} data-testid={`landing-how-${key}`} className="relative flex flex-col gap-3">
              {i < STEPS.length - 1 && (
                <div aria-hidden className="absolute top-5 left-[calc(2.5rem+2px)] hidden h-px w-[calc(100%-2.5rem)] border-t border-line lg:block" />
              )}
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft font-mono text-[28px] leading-none text-accent">
                {i + 1}
              </span>
              <h3 className="font-display text-lg text-ink">{t(locale, titleKey)}</h3>
              <p className="text-[13px] text-ink-secondary">{t(locale, bodyKey)}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

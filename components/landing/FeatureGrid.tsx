import { Box, Calculator, FileText, ImageDown, Ruler, Sparkles, type LucideIcon } from 'lucide-react'
import { t, type Locale, type MessageKey } from '@/lib/i18n'

const FEATURES: readonly { key: string; icon: LucideIcon; titleKey: MessageKey; bodyKey: MessageKey }[] = [
  { key: 'f3d', icon: Box, titleKey: 'landing.features.f3d.title', bodyKey: 'landing.features.f3d.body' },
  { key: 'fphoto', icon: ImageDown, titleKey: 'landing.features.fphoto.title', bodyKey: 'landing.features.fphoto.body' },
  { key: 'fpdf', icon: FileText, titleKey: 'landing.features.fpdf.title', bodyKey: 'landing.features.fpdf.body' },
  { key: 'fgen', icon: Sparkles, titleKey: 'landing.features.fgen.title', bodyKey: 'landing.features.fgen.body' },
  { key: 'fcost', icon: Calculator, titleKey: 'landing.features.fcost.title', bodyKey: 'landing.features.fcost.body' },
  { key: 'funits', icon: Ruler, titleKey: 'landing.features.funits.title', bodyKey: 'landing.features.funits.body' },
]

export function FeatureGrid({ locale }: { locale: Locale }) {
  return (
    <section className="bg-surface px-6 py-20" data-testid="landing-features">
      <div className="mx-auto max-w-5xl">
        <h2 className="mb-10 font-display text-3xl tracking-tight text-ink">{t(locale, 'landing.features.title')}</h2>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ key, icon: Icon, titleKey, bodyKey }) => (
            <div
              key={key}
              data-testid={`landing-feature-${key}`}
              className="eg-tilt eg-reveal flex flex-col gap-2 rounded-lg border border-line bg-surface-raised p-5"
            >
              <Icon size={20} strokeWidth={1.6} className="text-accent" aria-hidden />
              <h3 className="font-display text-lg text-ink">{t(locale, titleKey)}</h3>
              <p className="text-[13px] text-ink-secondary">{t(locale, bodyKey)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

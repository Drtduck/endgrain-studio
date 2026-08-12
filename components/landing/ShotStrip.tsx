import { t, type Locale } from '@/lib/i18n'

// Снимаются через `pnpm shots` (e2e/shots.spec.ts) и коммитятся как обычные файлы.
// Комплект свой на каждую локаль: интерфейс на снимке должен совпадать с языком лендинга.
const SHOTS = [
  { file: 'editor.png', slug: 'editor', labelRu: 'Редактор', labelEn: 'Editor' },
  { file: 'templates.png', slug: 'templates', labelRu: 'Шаблоны', labelEn: 'Templates' },
  { file: 'generator.png', slug: 'generator', labelRu: 'Генератор', labelEn: 'Generator' },
  { file: 'photo.png', slug: 'photo', labelRu: 'Фото в узор', labelEn: 'Photo to pattern' },
  { file: 'view3d.png', slug: 'view3d', labelRu: 'Превью в 3D', labelEn: '3D preview' },
] as const

export function ShotStrip({ locale }: { locale: Locale }) {
  return (
    <section className="bg-surface px-6 py-20" data-testid="landing-shots">
      <div className="mx-auto max-w-5xl">
        <h2 className="mb-8 font-display text-3xl tracking-tight text-ink">{t(locale, 'landing.shots.title')}</h2>

        <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2">
          {SHOTS.map((shot) => (
            <img
              key={shot.file}
              src={`/landing/shots/${locale}/${shot.file}`}
              width={1280}
              height={720}
              loading="lazy"
              alt={locale === 'ru' ? shot.labelRu : shot.labelEn}
              data-testid={`landing-shot-${shot.slug}`}
              className="eg-tilt h-auto w-[85vw] shrink-0 snap-start rounded-lg border border-line bg-surface-raised sm:w-[420px]"
            />
          ))}
        </div>
      </div>
    </section>
  )
}

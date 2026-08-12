import { TEMPLATES } from '@/lib/designs/templates'
import { APP_ORIGIN } from '@/lib/routing/host'
import { t, type Locale } from '@/lib/i18n'

/**
 * Витрина узоров: студийные фото досок вместо схематичных превью. Файлы лежат в
 * public/patterns и называются по id шаблона, поэтому список карточек берётся прямо
 * из TEMPLATES и не расходится с библиотекой студии. Всё считается на сервере,
 * в браузер уезжает статичная разметка и ноль килобайт JS.
 */
export function PatternGrid({ locale }: { locale: Locale }) {
  return (
    <div className="bg-canvas px-6 pb-4" data-testid="landing-pattern-grid">
      <ul className="mx-auto grid max-w-5xl grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {TEMPLATES.map((tpl, i) => {
          const name = t(locale, tpl.nameKey)
          return (
            <li key={tpl.id}>
              <a
                href={APP_ORIGIN}
                data-testid={`landing-pattern-${tpl.id}`}
                className="eg-photo-card group relative block aspect-square overflow-hidden rounded-xl bg-surface-sunken shadow-sm ring-1 ring-line/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <img
                  src={`/patterns/${tpl.id}.webp`}
                  width={900}
                  height={900}
                  // Первый ряд виден сразу после перехода по «Посмотреть узоры», остальное подгружается лениво.
                  loading={i < 4 ? 'eager' : 'lazy'}
                  decoding="async"
                  alt={t(locale, 'landing.patterns.alt', { name })}
                  className="eg-photo-zoom size-full object-cover"
                />
                <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pt-8 pb-2 font-sans text-xs font-semibold text-white opacity-0 transition-opacity duration-hover group-hover:opacity-100">
                  {name}
                </span>
              </a>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

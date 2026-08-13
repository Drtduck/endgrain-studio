import { TEMPLATES, type BoardTemplate } from '@/lib/designs/templates'
import { APP_ORIGIN } from '@/lib/routing/host'
import { t, type Locale } from '@/lib/i18n'

/**
 * Витрина узоров двумя встречными лентами: верхняя едет влево, нижняя вправо.
 * Движение чисто на CSS, поэтому в браузер уезжает статичная разметка и ноль
 * килобайт JS, а prefers-reduced-motion гасит всё общим killswitch в globals.css.
 */
const HALF = Math.ceil(TEMPLATES.length / 2)
const ROW_A = TEMPLATES.slice(0, HALF)
const ROW_B = TEMPLATES.slice(HALF)

function Row({
  templates,
  locale,
  reverse,
  durationS,
  testId,
}: {
  templates: readonly BoardTemplate[]
  locale: Locale
  reverse?: boolean
  durationS: number
  testId: string
}) {
  // Набор дублируется ровно дважды: keyframes везёт трек на -50%, на стыке
  // рисунок совпадает и шва не видно.
  const items = [...templates, ...templates]

  return (
    <div
      className="eg-marquee overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]"
      data-testid={testId}
    >
      <div
        className={reverse ? 'eg-marquee-track eg-marquee-reverse py-3' : 'eg-marquee-track py-3'}
        style={{ '--eg-marquee-dur': `${durationS}s` } as React.CSSProperties}
      >
        {items.map((tpl, i) => {
          const name = t(locale, tpl.nameKey)
          const clone = i >= templates.length
          return (
            <a
              key={`${tpl.id}-${i}`}
              href={APP_ORIGIN}
              {...(clone ? { 'aria-hidden': true, tabIndex: -1 } : { 'data-testid': `landing-pattern-${tpl.id}` })}
              className="eg-photo-card group relative mx-2 block aspect-square w-40 shrink-0 overflow-hidden rounded-xl bg-surface-sunken shadow-sm ring-1 ring-line/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:mx-3 sm:w-48 lg:w-56"
            >
              <img
                src={`/patterns/${tpl.id}.webp`}
                width={900}
                height={900}
                // Оригиналы грузятся сразу, клоны лениво: src тот же, браузер отдаёт их из кеша.
                loading={clone ? 'lazy' : 'eager'}
                decoding="async"
                alt={clone ? '' : t(locale, 'landing.patterns.alt', { name })}
                className="eg-photo-zoom size-full object-cover"
              />
              <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pt-8 pb-2 font-sans text-xs font-semibold text-white opacity-0 transition-opacity duration-hover group-hover:opacity-100">
                {name}
              </span>
            </a>
          )
        })}
      </div>
    </div>
  )
}

export function PatternMarquee({ locale }: { locale: Locale }) {
  return (
    <div className="flex flex-col gap-4 bg-canvas py-4" data-testid="landing-pattern-marquee">
      <Row templates={ROW_A} locale={locale} durationS={72} testId="landing-marquee-row-a" />
      <Row templates={ROW_B} locale={locale} reverse durationS={54} testId="landing-marquee-row-b" />
    </div>
  )
}

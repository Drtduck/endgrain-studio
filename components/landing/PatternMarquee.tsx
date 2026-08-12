import { compile } from '@/lib/engine'
import { TEMPLATES, type BoardTemplate } from '@/lib/designs/templates'
import { BoardSvg } from '@/components/BoardSvg'
import { APP_ORIGIN } from '@/lib/routing/host'
import type { Locale } from '@/lib/i18n'

/**
 * Витрина не картинки, а живой рендер: каждая доска компилируется движком из того
 * же шаблона, который откроется в студии по клику. Считается на сервере при сборке
 * страницы, поэтому в браузер уезжает готовый SVG и ноль килобайт JS.
 */
const ROW_A = TEMPLATES.slice(0, 8)
const ROW_B = TEMPLATES.slice(8, 16)

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
  const items = [...templates, ...templates] // дубль для бесшовной петли

  return (
    <div
      className="eg-marquee overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]"
      data-testid={testId}
    >
      <div
        className={reverse ? 'eg-marquee-track eg-marquee-reverse' : 'eg-marquee-track'}
        style={{ ['--eg-marquee-dur' as string]: `${durationS}s` }}
      >
        {items.map((tpl, i) => (
          <a
            key={`${tpl.id}-${i}`}
            // Применение шаблона по ?tpl= студия сегодня не поддерживает, поэтому ссылка
            // ведёт просто на APP_ORIGIN. Параметр остаётся заделом на будущее.
            href={APP_ORIGIN}
            className="eg-tilt mx-3 block shrink-0 rounded-lg bg-surface p-3 shadow-sm"
            aria-hidden={i >= templates.length}
            tabIndex={i >= templates.length ? -1 : undefined}
          >
            <BoardSvg model={compile(tpl.build())} locale={locale} maxPx={200} />
          </a>
        ))}
      </div>
    </div>
  )
}

export function PatternMarquee({ locale }: { locale: Locale }) {
  return (
    <div className="flex flex-col gap-6 bg-canvas py-6" data-testid="landing-pattern-marquee">
      <Row templates={ROW_A} locale={locale} durationS={72} testId="landing-marquee-row-a" />
      <Row templates={ROW_B} locale={locale} reverse durationS={54} testId="landing-marquee-row-b" />
    </div>
  )
}

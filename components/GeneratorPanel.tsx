'use client'

import { t } from '@/lib/i18n'
import { useStudio } from '@/lib/store/studio'

/**
 * Заготовка вкладки генератора: сама генерация узоров - задача 7 этой фазы.
 * Здесь только вкладка существует и отдаёт всю ширину, как того требует StudioShell.
 */
export function GeneratorPanel() {
  const locale = useStudio((s) => s.locale)
  return (
    <section data-testid="generator-panel" aria-label={t(locale, 'aria.generatorPanel')} className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{t(locale, 'gen.title')}</h2>
      <p className="text-sm text-muted-foreground">{t(locale, 'gen.subtitle')}</p>
    </section>
  )
}

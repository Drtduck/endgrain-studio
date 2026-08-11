'use client'

import { t } from '@/lib/i18n'
import { useStudio } from '@/lib/store/studio'

/**
 * Заготовка вкладки фото: разбор картинки и предпросмотр - задача 7 этой фазы.
 * Здесь только вкладка существует и отдаёт всю ширину, как того требует StudioShell.
 */
export function PhotoImport() {
  const locale = useStudio((s) => s.locale)
  return (
    <section data-testid="photo-panel" aria-label={t(locale, 'aria.photoPanel')} className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{t(locale, 'photo.title')}</h2>
      <p className="text-sm text-muted-foreground">{t(locale, 'photo.subtitle')}</p>
    </section>
  )
}

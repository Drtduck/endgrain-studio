'use client'

import type { Locale } from '@/lib/i18n'
import { useInitialLocale } from '@/lib/store/locale'

/**
 * Язык из cookie лендинга приезжает в стор студии на самом верху дерева, поэтому
 * его подхватывают разом и редактор, и /register, и /login. Ничего не рендерит.
 */
export function LocaleBootstrap({ locale }: { locale: Locale }) {
  useInitialLocale(locale)
  return null
}

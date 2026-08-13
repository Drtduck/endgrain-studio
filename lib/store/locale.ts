'use client'

import { useEffect, useRef } from 'react'
import type { Locale } from '@/lib/i18n'
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE_S, localeCookieDomain } from '@/lib/landing/localeCookie'
import { useStudio } from './studio'

/**
 * Язык студии наследуется от лендинга. Стор живёт на клиенте и cookie на сервере не видит,
 * поэтому локаль приезжает пропсом из серверного компонента и применяется один раз после
 * гидратации: писать в стор во время рендера нельзя, singleton общий для всех запросов SSR.
 */
export function useInitialLocale(initialLocale: Locale | undefined): void {
  const applied = useRef(false)
  useEffect(() => {
    if (applied.current || initialLocale === undefined) return
    applied.current = true
    if (useStudio.getState().locale !== initialLocale) useStudio.getState().setLocale(initialLocale)
  }, [initialLocale])
}

/** Переключение языка в студии обновляет cookie лендинга: два входа в продукт не должны расходиться. */
export function rememberLocale(locale: Locale): void {
  if (typeof document === 'undefined') return
  const domain = localeCookieDomain(window.location.origin)
  const domainPart = domain ? `; domain=${domain}` : ''
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE_S}; samesite=lax${domainPart}`
}

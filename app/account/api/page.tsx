import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { listApiKeysAction } from '@/app/actions/apiKeys'
import { ApiKeysPanel } from '@/components/account/ApiKeysPanel'
import { t } from '@/lib/i18n'
import { getLandingLocale } from '@/lib/landing/locale'
import { LOGIN_PATH } from '@/lib/auth/access'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLandingLocale()
  return { title: t(locale, 'apiKeys.navTitle') }
}

/**
 * Раздел «Аккаунт», которого до этой страницы не было: создаётся вместе с ней,
 * минимальный layout. Гейт стандартный - PUBLIC_PREFIXES в lib/auth/access.ts
 * не содержит /account, поэтому proxy.ts уже отправляет анонима на логин
 * раньше, чем рендер доходит сюда. Проверка ниже - второй слой на случай
 * PUBLIC_STUDIO=1 (аварийный флаг открывает всё, включая эту страницу):
 * без пользователя список ключей просто не из чего строить.
 */
export default async function ApiKeysPage() {
  const locale = await getLandingLocale()
  const result = await listApiKeysAction()

  if (!result.ok && result.error === 'unauthenticated') {
    redirect(`${LOGIN_PATH}?next=%2Faccount%2Fapi`)
  }

  const keys = result.ok ? result.data : []

  return (
    <main className="min-h-screen bg-app px-4 py-10">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div className="flex flex-col gap-1">
          <Link href="/" data-testid="api-keys-back" className="text-[13px] text-accent hover:underline">
            {t(locale, 'app.title')}
          </Link>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">{t(locale, 'apiKeys.title')}</h1>
          <p className="max-w-[60ch] text-ink-secondary">{t(locale, 'apiKeys.subtitle')}</p>
        </div>

        <ApiKeysPanel locale={locale} initialKeys={keys} />
      </div>
    </main>
  )
}

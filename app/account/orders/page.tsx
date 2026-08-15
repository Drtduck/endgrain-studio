import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { readMerchOrdersAction } from '@/app/actions/merch'
import { MerchOrdersPanel } from '@/components/account/MerchOrdersPanel'
import { t } from '@/lib/i18n'
import { getLandingLocale } from '@/lib/landing/locale'
import { LOGIN_PATH } from '@/lib/auth/access'
import { getCurrentUser } from '@/lib/supabase/session'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLandingLocale()
  return { title: t(locale, 'merch.orders.title') }
}

/**
 * «Мои заказы» (§7 спеки merch-orders.md), рядом с /account/billing. Гейт
 * как у billing/page.tsx: анонима отправляем на логин раньше рендера.
 * Пункт навигации на этот раздел появляется всегда (AccountMenu), даже при
 * нуле заказов - человек ищет, куда делся заказ, а не вспоминает, был ли он.
 */
export default async function MerchOrdersPage() {
  const locale = await getLandingLocale()
  const user = await getCurrentUser()
  if (!user) redirect(`${LOGIN_PATH}?next=%2Faccount%2Forders`)

  const result = await readMerchOrdersAction()
  const orders = result.ok ? result.data : []

  return (
    <div className="min-h-screen bg-app">
      <main className="px-4 py-10">
        <div className="mx-auto flex max-w-2xl flex-col gap-6">
          <div>
            <h1 className="font-display text-2xl font-semibold text-ink" data-testid="merch-orders-title">
              {t(locale, 'merch.orders.title')}
            </h1>
            <p className="max-w-[60ch] text-ink-secondary">{t(locale, 'merch.orders.subtitle')}</p>
          </div>

          <MerchOrdersPanel orders={orders} locale={locale} />
        </div>
      </main>
    </div>
  )
}

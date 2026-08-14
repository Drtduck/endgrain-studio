'use client'

import { usePro } from '@/components/ProProvider'
import { t, type Locale } from '@/lib/i18n'

/**
 * Тариф в шапке аккаунта. Статус считается на сервере (app/layout.tsx) и
 * приезжает через ProProvider, тем же путём, что и в AccountMenu - здесь
 * только чтение контекста, без похода в базу.
 */
export function PlanBadge({ locale }: { readonly locale: Locale }) {
  const { status, billingEnabled } = usePro()
  if (!billingEnabled) return null
  return (
    <span data-testid="profile-plan" className="text-sm text-ink-secondary">
      {t(locale, 'profile.plan', { plan: t(locale, status.pro ? 'profile.planPro' : 'profile.planFree') })}
    </span>
  )
}

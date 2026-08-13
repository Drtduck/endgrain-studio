'use client'

import Link from 'next/link'
import { Check } from 'lucide-react'
import { useSession } from '@/components/SessionProvider'
import { Button } from '@/components/ui/button'
import { t, type Locale } from '@/lib/i18n'

/**
 * Карточка на месте панели генерации, когда пробные генерации закончились.
 * Заменяет строку-замок: три пункта что даёт Pro, кнопка на тарифы и, только
 * для гостя, вторая кнопка «Войти» с явной подписью, что вход не добавляет
 * пробных - аккаунт нужен для покупки, а не для обхода счётчика.
 *
 * Сгенерированные кадры с экрана не исчезают: панель рисует эту карточку
 * рядом с уже готовой галереей, а не вместо неё.
 */
export function TrialPaywall({ locale }: { locale: Locale }) {
  const { user } = useSession()

  return (
    <div
      data-testid="promo-paywall"
      className="flex flex-col gap-3 rounded-lg border border-line-subtle bg-surface-raised p-4"
    >
      <h3 className="font-display text-[17px] font-semibold">{t(locale, 'ai.paywall.title')}</h3>
      <ul className="flex flex-col gap-1.5">
        {(['ai.paywall.point1', 'ai.paywall.point2', 'ai.paywall.point3'] as const).map((key) => (
          <li key={key} className="flex items-start gap-2 text-[13px] text-ink-secondary">
            <Check aria-hidden className="mt-0.5 size-3.5 shrink-0 text-accent" />
            <span>{t(locale, key)}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" data-testid="promo-paywall-pricing" render={<Link href="/pricing" />}>
          {t(locale, 'ai.gate.pricing')}
        </Button>
        {user === null ? (
          <div className="flex flex-col gap-0.5">
            <Button size="sm" variant="outline" data-testid="promo-paywall-signin" render={<Link href="/login" />}>
              {t(locale, 'ai.paywall.signin')}
            </Button>
            <span className="text-xs text-ink-muted">{t(locale, 'ai.paywall.signinNote')}</span>
          </div>
        ) : null}
      </div>
    </div>
  )
}

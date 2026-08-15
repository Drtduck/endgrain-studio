'use client'

import { useTransition, type ReactElement } from 'react'
import { CreditCard, LogIn, LogOut, Package, Plug, Sparkles, User } from 'lucide-react'
import { signOutAction } from '@/app/actions/auth'
import { Avatar } from '@/components/account/Avatar'
import { NavLink } from '@/components/NavLink'
import { useSession } from '@/components/SessionProvider'
import { UpgradeButton } from '@/components/UpgradeButton'
import { usePro } from '@/components/ProProvider'
import { Button } from '@/components/ui/button'
import { Menu, MenuContent, MenuItem, MenuLinkItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu'
import { t, type Locale } from '@/lib/i18n'
import { useStudio } from '@/lib/store/studio'

/**
 * Весь аккаунт справа в шапке одной иконкой: раньше там в ряд стояли почта,
 * «Выйти» и «Улучшить», и на 375px этот ряд занимал полстроки.
 *
 * Гостю меню не нужно: показываем прямую кнопку входа, а «Улучшить» остаётся
 * отдельной кнопкой, потому что прятать монетизацию под аватар, которого у
 * гостя нет, некуда.
 *
 * hrefBase и locale - для шапки лендинга/блога (домен endgrain.app, не
 * app.endgrain.app). Там ссылки на «Аккаунт», «Ключи API» и «Тарифы» ведут на
 * страницы студии на СОСЕДНЕМ домене: next/link (NavLink) для них не годится -
 * проверил бы маршрут на текущем домене и упёрся в 307 из proxy.ts (см. блог-
 * ссылку в AppHeader.tsx, та же причина зеркально). При заданном hrefBase все
 * такие ссылки становятся обычными <a href="{hrefBase}/путь">. Локаль тоже
 * приходит пропсом: useStudio - состояние студии, на лендинге/блоге его никто
 * не инициализирует из cookie eg-locale, значение было бы просто дефолтным.
 * Без пропсов поведение то же, что и раньше (студия, useStudio, NavLink).
 */
export function AccountMenu({ locale: localeProp, hrefBase }: { locale?: Locale; hrefBase?: string } = {}) {
  const studioLocale = useStudio((s) => s.locale)
  const locale = localeProp ?? studioLocale
  const { user, enabled, avatarUrl = null } = useSession()
  const { status, billingEnabled, ai } = usePro()
  const [signingOut, startSignOut] = useTransition()

  function accountLink(path: string): ReactElement {
    return hrefBase ? <a href={`${hrefBase}${path}`} /> : <NavLink href={path} />
  }

  if (!user) {
    return (
      <>
        <UpgradeButton />
        {enabled ? (
          <Button variant="outline" size="sm" data-testid="account-login" render={accountLink('/login')}>
            <LogIn data-icon="inline-start" />
            {t(locale, 'account.signIn')}
          </Button>
        ) : null}
      </>
    )
  }

  return (
    <Menu>
      <MenuTrigger
        data-testid="account-menu-trigger"
        aria-haspopup="menu"
        aria-label={t(locale, 'account.menuLabel', { email: user.email })}
        className="rounded-full data-popup-open:opacity-80"
      >
        <Avatar seed={user.id} label={user.email} url={avatarUrl} size="sm" />
        {/* Почта в доступном имени и заодно якорь для e2e: меню закрыто, а адрес в DOM есть. */}
        <span data-testid="account-email" className="sr-only">
          {user.email}
        </span>
      </MenuTrigger>

      <MenuContent data-testid="account-menu">
        {/* Тот же аватар в шапке меню: открытая выпадашка перекрывает кнопку,
            и без картинки здесь непонятно, чей это аккаунт. */}
        <div className="flex items-center gap-2.5 px-3 pt-2 pb-2.5">
          <Avatar seed={user.id} label={user.email} url={avatarUrl} size="sm" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span data-testid="account-menu-email" title={user.email} className="truncate text-[13px] font-medium text-ink">
              {user.email}
            </span>
            {billingEnabled ? (
              <span data-testid="account-menu-plan" className="text-[11px] text-ink-muted">
                {t(locale, status.pro ? 'account.planPro' : 'account.planFree')}
              </span>
            ) : null}
            {ai.state === 'mock' ? null : (
              <span data-testid="account-menu-quota" className="text-[11px] text-ink-muted">
                {t(locale, 'ai.quota', { remaining: ai.remaining, free: ai.freeRemaining, credits: ai.credits })}
              </span>
            )}
          </div>
        </div>

        <MenuSeparator />

        <MenuLinkItem data-testid="account-menu-profile" render={accountLink('/account')}>
          <User />
          {t(locale, 'account.profile')}
        </MenuLinkItem>

        {/* Ключи API нужны, только когда человек подключает студию к своему агенту,
            поэтому в шапке им места нет: раздел живёт под аватаром рядом с профилем. */}
        <MenuLinkItem data-testid="account-menu-mcp" render={accountLink('/account/api')}>
          <Plug />
          {t(locale, 'account.mcp')}
        </MenuLinkItem>

        {/* Раздел появляется всегда, даже при нуле заказов (§7 спеки merch-orders.md):
            человек, который ищет «а где мой заказ», должен найти пункт, а не
            вспоминать, покупал ли он что-то вообще. Не зависит от billingEnabled -
            это чтение своих заказов, а не оформление подписки. */}
        <MenuLinkItem data-testid="account-menu-orders" render={accountLink('/account/orders')}>
          <Package />
          {t(locale, 'merch.orders.title')}
        </MenuLinkItem>

        <MenuSeparator />

        {billingEnabled && !status.pro ? (
          // Апгрейд первым пунктом и акцентом: кнопка ушла из шапки, но осталась
          // первым, что видно в открытом меню.
          <MenuLinkItem
            data-testid="account-menu-upgrade"
            className="font-semibold text-accent data-highlighted:bg-accent-soft"
            render={accountLink('/pricing')}
          >
            <Sparkles />
            {t(locale, 'account.upgrade')}
          </MenuLinkItem>
        ) : null}

        {/* Показывается всем вошедшим при работающей кассе, не только Pro:
            баланс кадров и кошелёк для видео есть и у бесплатного тарифа. */}
        {billingEnabled ? (
          <MenuLinkItem data-testid="account-menu-billing" render={accountLink('/account/billing')}>
            <CreditCard />
            {t(locale, 'account.billing')}
          </MenuLinkItem>
        ) : null}

        {billingEnabled ? <MenuSeparator /> : null}

        <MenuItem
          data-testid="account-signout"
          disabled={signingOut}
          onClick={() => startSignOut(() => void signOutAction())}
        >
          <LogOut />
          {t(locale, 'account.signOut')}
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}

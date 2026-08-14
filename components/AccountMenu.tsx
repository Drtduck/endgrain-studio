'use client'

import { useTransition } from 'react'
import { CreditCard, LogIn, LogOut, Plug, Sparkles, User } from 'lucide-react'
import { signOutAction } from '@/app/actions/auth'
import { Avatar } from '@/components/account/Avatar'
import { NavLink } from '@/components/NavLink'
import { useSession } from '@/components/SessionProvider'
import { UpgradeButton } from '@/components/UpgradeButton'
import { usePro } from '@/components/ProProvider'
import { Button } from '@/components/ui/button'
import { Menu, MenuContent, MenuItem, MenuLinkItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu'
import { t } from '@/lib/i18n'
import { useStudio } from '@/lib/store/studio'

/**
 * Весь аккаунт справа в шапке одной иконкой: раньше там в ряд стояли почта,
 * «Выйти» и «Улучшить», и на 375px этот ряд занимал полстроки.
 *
 * Гостю меню не нужно: показываем прямую кнопку входа, а «Улучшить» остаётся
 * отдельной кнопкой, потому что прятать монетизацию под аватар, которого у
 * гостя нет, некуда.
 */
export function AccountMenu() {
  const locale = useStudio((s) => s.locale)
  const { user, enabled } = useSession()
  const { status, billingEnabled, ai } = usePro()
  const [signingOut, startSignOut] = useTransition()

  if (!user) {
    return (
      <>
        <UpgradeButton />
        {enabled ? (
          <Button variant="outline" size="sm" data-testid="account-login" render={<NavLink href="/login" />}>
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
        <Avatar seed={user.id} label={user.email} size="sm" />
        {/* Почта в доступном имени и заодно якорь для e2e: меню закрыто, а адрес в DOM есть. */}
        <span data-testid="account-email" className="sr-only">
          {user.email}
        </span>
      </MenuTrigger>

      <MenuContent data-testid="account-menu">
        <div className="flex flex-col gap-0.5 px-3 pt-2 pb-2.5">
          <span data-testid="account-menu-email" title={user.email} className="truncate text-[13px] font-medium text-ink">
            {user.email}
          </span>
          {billingEnabled ? (
            <span data-testid="account-menu-plan" className="text-[11px] text-ink-muted">
              {t(locale, status.pro ? 'account.planPro' : 'account.planFree')}
            </span>
          ) : null}
          {ai.state === 'pro' ? (
            <span data-testid="account-menu-quota" className="text-[11px] text-ink-muted">
              {t(locale, 'account.quota', { remaining: ai.remaining, limit: ai.limit })}
            </span>
          ) : null}
        </div>

        <MenuSeparator />

        <MenuLinkItem data-testid="account-menu-profile" render={<NavLink href="/account" />}>
          <User />
          {t(locale, 'account.profile')}
        </MenuLinkItem>

        {/* Ключи API нужны, только когда человек подключает студию к своему агенту,
            поэтому в шапке им места нет: раздел живёт под аватаром рядом с профилем. */}
        <MenuLinkItem data-testid="account-menu-mcp" render={<NavLink href="/account/api" />}>
          <Plug />
          {t(locale, 'account.mcp')}
        </MenuLinkItem>

        <MenuSeparator />

        {billingEnabled ? (
          status.pro ? (
            <MenuLinkItem data-testid="account-menu-billing" render={<NavLink href="/pricing" />}>
              <CreditCard />
              {t(locale, 'account.billing')}
            </MenuLinkItem>
          ) : (
            // Апгрейд первым пунктом и акцентом: кнопка ушла из шапки, но осталась
            // первым, что видно в открытом меню.
            <MenuLinkItem
              data-testid="account-menu-upgrade"
              className="font-semibold text-accent data-highlighted:bg-accent-soft"
              render={<NavLink href="/pricing" />}
            >
              <Sparkles />
              {t(locale, 'account.upgrade')}
            </MenuLinkItem>
          )
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

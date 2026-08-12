'use client'

import Link from 'next/link'
import { LogIn } from 'lucide-react'
import { signOutAction } from '@/app/actions/auth'
import { useSession } from '@/components/SessionProvider'
import { Button } from '@/components/ui/button'
import { t } from '@/lib/i18n'
import { useStudio } from '@/lib/store/studio'

export function AccountButton() {
  const locale = useStudio((s) => s.locale)
  const { user, enabled } = useSession()

  // Без переменных Supabase аккаунта в приложении не существует: не показываем
  // кнопку, которая всё равно приведёт в тупик.
  if (!enabled) return null

  if (!user) {
    return (
      <Button
        variant="outline"
        size="sm"
        data-testid="account-login"
        render={<Link href="/login" />}
      >
        <LogIn data-icon="inline-start" />
        {t(locale, 'account.signIn')}
      </Button>
    )
  }

  return (
    <form action={signOutAction} className="flex items-center gap-2">
      <span data-testid="account-email" className="max-w-[180px] truncate text-[11px] text-ink-muted">
        {user.email}
      </span>
      <Button type="submit" variant="ghost" size="sm" data-testid="account-signout">
        {t(locale, 'account.signOut')}
      </Button>
    </form>
  )
}

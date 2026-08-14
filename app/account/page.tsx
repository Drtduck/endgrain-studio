import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Avatar } from '@/components/account/Avatar'
import { DangerZone } from '@/components/account/DangerZone'
import { EmailSection } from '@/components/account/EmailSection'
import { PasswordSection } from '@/components/account/PasswordSection'
import { PlanBadge } from '@/components/account/PlanBadge'
import { ProfileForm } from '@/components/account/ProfileForm'
import { t } from '@/lib/i18n'
import { getLandingLocale } from '@/lib/landing/locale'
import { LOGIN_PATH } from '@/lib/auth/access'
import { getOwnProfile } from '@/lib/profile/read'
import { getAccountIdentity, getCurrentUser } from '@/lib/supabase/session'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLandingLocale()
  return { title: t(locale, 'profile.title') }
}

/**
 * Хаб профиля. Гейт как у /account/api: PUBLIC_PREFIXES не содержит /account,
 * значит proxy.ts уже уводит анонима на логин раньше рендера - проверка ниже
 * второй слой на случай PUBLIC_STUDIO=1.
 */
export default async function AccountPage() {
  const locale = await getLandingLocale()
  const user = await getCurrentUser()
  if (!user) redirect(`${LOGIN_PATH}?next=%2Faccount`)

  const [profile, identity] = await Promise.all([getOwnProfile(user.id), getAccountIdentity()])

  return (
    <div className="min-h-screen bg-app">
      <main className="px-4 py-10">
        <div className="mx-auto flex max-w-2xl flex-col gap-6">
          <div className="flex items-center gap-3">
            <Avatar seed={user.id} label={profile?.displayName ?? user.email} url={profile?.avatarUrl ?? null} size="lg" />
            <div className="flex flex-col gap-0.5">
              <h1 className="font-display text-2xl font-semibold text-ink" data-testid="account-page-title">
                {profile?.displayName ?? user.email}
              </h1>
              <span data-testid="account-page-email" className="text-sm text-ink-secondary">
                {user.email}
              </span>
              <PlanBadge locale={locale} />
            </div>
          </div>
          <p className="max-w-[60ch] text-ink-secondary">{t(locale, 'profile.subtitle')}</p>

          <ProfileForm
            locale={locale}
            userId={user.id}
            fallbackLabel={user.email}
            initial={{
              displayName: profile?.displayName ?? null,
              avatarUrl: profile?.avatarUrl ?? null,
              bio: profile?.bio ?? null,
              website: profile?.website ?? null,
              notifyEmail: profile?.notifyEmail ?? true,
            }}
          />

          <EmailSection locale={locale} currentEmail={user.email} googleOnly={identity?.googleOnly ?? false} />

          <PasswordSection locale={locale} hasPassword={identity?.hasPassword ?? false} />

          <DangerZone locale={locale} email={user.email} />
        </div>
      </main>
    </div>
  )
}

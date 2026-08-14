'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { updateProfileAction, type ProfileError } from '@/app/actions/profile'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { Profile } from '@/lib/profile/types'
import { t, type Locale, type MessageKey } from '@/lib/i18n'

const ERROR_KEYS: Readonly<Partial<Record<ProfileError, MessageKey>>> = {
  invalid: 'profile.error.invalid',
  failed: 'profile.error.failed',
}

export interface ProfileFormProps {
  readonly locale: Locale
  readonly userId: string
  readonly initial: Pick<Profile, 'displayName' | 'bio' | 'website' | 'notifyEmail'>
}

/** Публичный профиль (display_name/bio/website) плюс notify_email одной формой. */
export function ProfileForm({ locale, userId, initial }: ProfileFormProps) {
  const [displayName, setDisplayName] = useState(initial.displayName ?? '')
  const [bio, setBio] = useState(initial.bio ?? '')
  const [website, setWebsite] = useState(initial.website ?? '')
  const [notifyEmail, setNotifyEmail] = useState(initial.notifyEmail)
  const [busy, startTransition] = useTransition()
  const [error, setError] = useState<ProfileError | null>(null)
  const [saved, setSaved] = useState(false)
  const router = useRouter()

  const submit = (): void => {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const res = await updateProfileAction({ displayName, bio, website, notifyEmail })
      if (res.ok) {
        setSaved(true)
        // Публичная страница /u/[id] и шапка (displayName в Avatar) читают профиль
        // из серверного рендера - без refresh() правка была бы видна только после
        // ручной перезагрузки страницы.
        router.refresh()
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <div data-testid="profile-form" className="flex flex-col gap-4 rounded-lg border border-line-subtle bg-surface-raised p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-base font-semibold text-ink">{t(locale, 'profile.public.title')}</h2>
        <Link href={`/u/${userId}`} data-testid="profile-view-public" className="text-[13px] text-accent hover:underline">
          {t(locale, 'profile.viewPublic')}
        </Link>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="profile-display-name" className="text-xs text-ink-secondary">
          {t(locale, 'profile.displayName')}
        </label>
        <Input
          id="profile-display-name"
          data-testid="profile-display-name"
          value={displayName}
          placeholder={t(locale, 'profile.displayNamePlaceholder')}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={40}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="profile-bio" className="text-xs text-ink-secondary">
          {t(locale, 'profile.bio')}
        </label>
        <Textarea id="profile-bio" data-testid="profile-bio" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={280} />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="profile-website" className="text-xs text-ink-secondary">
          {t(locale, 'profile.website')}
        </label>
        <Input
          id="profile-website"
          data-testid="profile-website"
          value={website}
          placeholder="https://"
          onChange={(e) => setWebsite(e.target.value)}
          maxLength={200}
        />
      </div>

      <div className="flex flex-col gap-1.5 border-t border-line-subtle pt-3">
        <h3 className="text-xs font-medium text-ink-secondary">{t(locale, 'profile.notify.title')}</h3>
        <label className="flex items-center gap-2 text-sm text-ink-secondary">
          <input
            type="checkbox"
            data-testid="profile-notify-email"
            checked={notifyEmail}
            onChange={(e) => setNotifyEmail(e.target.checked)}
            className="size-4"
          />
          {t(locale, 'profile.notify.email')}
        </label>
      </div>

      <div className="flex items-center gap-3">
        <Button data-testid="profile-save" disabled={busy} onClick={submit}>
          {busy ? t(locale, 'profile.saving') : t(locale, 'profile.save')}
        </Button>
        {saved ? (
          <span data-testid="profile-saved" className="text-sm text-ink-secondary">
            {t(locale, 'profile.saved')}
          </span>
        ) : null}
        {error !== null ? (
          <span role="alert" data-testid="profile-error" className="text-sm text-error-text">
            {t(locale, ERROR_KEYS[error] ?? 'profile.error.failed')}
          </span>
        ) : null}
      </div>
    </div>
  )
}

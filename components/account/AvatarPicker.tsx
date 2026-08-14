'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateAvatarAction } from '@/app/actions/profile'
import { Avatar } from '@/components/account/Avatar'
import { Button } from '@/components/ui/button'
import { t, type Locale, type MessageKey } from '@/lib/i18n'
import { AVATAR_ALLOWED_MIME, AVATAR_BUCKET, AVATAR_MAX_BYTES, avatarObjectPath, avatarPublicUrl } from '@/lib/profile/avatar'
import { resizeToSquarePng } from '@/lib/profile/resize'
import { SUPABASE_URL } from '@/lib/supabase/config'
import { getSupabaseBrowser } from '@/lib/supabase/browser'

export interface AvatarPickerProps {
  readonly locale: Locale
  readonly userId: string
  /** Подпись для инициала, пока картинки нет: имя или почта. */
  readonly label: string
  readonly initialUrl: string | null
}

/**
 * Выбор иконки профиля. Файл уходит в Storage прямо из браузера под сессией
 * пользователя (bucket avatars, политика avatars_insert_own пускает только в
 * папку {user_id}/), а server action получает уже готовую ссылку и проверяет
 * её. Через сервер файл не гоняем: это лишний мегабайт по нашей сети ради
 * картинки, которую клиент всё равно сам режет до 256 px в canvas.
 */
export function AvatarPicker({ locale, userId, label, initialUrl }: AvatarPickerProps) {
  const [url, setUrl] = useState<string | null>(initialUrl)
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null)
  const [busy, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const pick = (): void => {
    setErrorKey(null)
    inputRef.current?.click()
  }

  const onFile = (file: File | undefined): void => {
    if (file === undefined) return
    setErrorKey(null)
    if (!AVATAR_ALLOWED_MIME.includes(file.type)) {
      setErrorKey('profile.avatar.error.type')
      return
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setErrorKey('profile.avatar.error.size')
      return
    }

    startTransition(async () => {
      try {
        const blob = await resizeToSquarePng(file)
        const path = avatarObjectPath(userId)
        const sb = getSupabaseBrowser()
        const { error } = await sb.storage.from(AVATAR_BUCKET).upload(path, blob, {
          // Путь фиксированный, значит при замене мы перезаписываем свой же
          // объект, а не плодим их в bucket.
          upsert: true,
          contentType: 'image/png',
          cacheControl: '3600',
        })
        if (error) {
          setErrorKey('profile.avatar.error.failed')
          return
        }
        const next = avatarPublicUrl(SUPABASE_URL, path, Date.now())
        const res = await updateAvatarAction(next)
        if (!res.ok) {
          setErrorKey('profile.avatar.error.failed')
          return
        }
        setUrl(next)
        // Шапка и публичная страница читают профиль серверным рендером.
        router.refresh()
      } catch {
        setErrorKey('profile.avatar.error.failed')
      } finally {
        if (inputRef.current !== null) inputRef.current.value = ''
      }
    })
  }

  const remove = (): void => {
    setErrorKey(null)
    startTransition(async () => {
      const res = await updateAvatarAction(null)
      if (!res.ok) {
        setErrorKey('profile.avatar.error.failed')
        return
      }
      setUrl(null)
      // Объект сносим следом и без проверки результата: строка в профиле уже
      // очищена, а живая публичная ссылка на брошенную картинку никому не нужна.
      try {
        await getSupabaseBrowser().storage.from(AVATAR_BUCKET).remove([avatarObjectPath(userId)])
      } catch {
        // Ошибка уборки не должна показываться как неудачное «Убрать».
      }
      router.refresh()
    })
  }

  return (
    <div data-testid="avatar-picker" className="flex items-center gap-3 border-b border-line-subtle pb-4">
      <Avatar seed={userId} label={label} url={url} size="lg" />
      <div className="flex flex-col gap-1.5">
        <h3 className="text-xs font-medium text-ink-secondary">{t(locale, 'profile.avatar.title')}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            data-testid="avatar-file"
            accept={AVATAR_ALLOWED_MIME.join(',')}
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <Button type="button" variant="outline" data-testid="avatar-upload" disabled={busy} onClick={pick}>
            {busy ? t(locale, 'profile.avatar.uploading') : t(locale, 'profile.avatar.upload')}
          </Button>
          {url !== null ? (
            <Button type="button" variant="ghost" data-testid="avatar-remove" disabled={busy} onClick={remove}>
              {t(locale, 'profile.avatar.remove')}
            </Button>
          ) : null}
        </div>
        {errorKey === null ? (
          <p className="text-[12px] text-ink-secondary">{t(locale, 'profile.avatar.hint')}</p>
        ) : (
          <p role="alert" data-testid="avatar-error" className="text-[12px] text-error-text">
            {t(locale, errorKey)}
          </p>
        )}
      </div>
    </div>
  )
}

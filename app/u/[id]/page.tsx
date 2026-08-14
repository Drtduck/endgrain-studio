import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { AppHeader } from '@/components/AppHeader'
import { Avatar } from '@/components/account/Avatar'
import { GalleryCard } from '@/components/gallery/GalleryCard'
import { listByAuthorPublic } from '@/lib/gallery/list'
import { t } from '@/lib/i18n'
import { getLandingLocale } from '@/lib/landing/locale'
import { getProfile } from '@/lib/profile/read'
import { getCurrentUser } from '@/lib/supabase/session'

export async function generateMetadata(props: PageProps<'/u/[id]'>): Promise<Metadata> {
  const { id } = await props.params
  const profile = await getProfile(id)
  return { title: profile?.displayName ?? t(await getLandingLocale(), 'author.empty') }
}

/**
 * Публичный профиль автора: открыт анониму (см. '/u' в PUBLIC_PREFIXES,
 * lib/auth/access.ts). Профиль без единой опубликованной строки в profiles
 * (человек никогда не заходил в /account) - это не 404: у него ещё могут
 * быть публичные работы в галерее, авторство определяется published_projects,
 * а не наличием строки в profiles.
 *
 * Обратный случай - владелец, у которого нет ни строки в profiles, ни
 * публикаций. Раньше он получал 404 по ссылке «Как меня видят» со своей же
 * страницы /account, и это выглядело как сломанное приложение. Проверить
 * существование auth.users анонимным клиентом нельзя (таблица закрыта), но
 * этого и не требуется: если id совпадает с id текущей сессии, пользователь
 * заведомо существует - показываем ему пустую витрину. Анониму, пришедшему
 * по ссылке на несуществующего или совсем пустого автора, по-прежнему
 * отдаётся 404: выдумывать страницу под произвольный uuid незачем.
 */
export default async function PublicProfilePage(props: PageProps<'/u/[id]'>) {
  const { id } = await props.params
  const [locale, profile, works, viewer] = await Promise.all([
    getLandingLocale(),
    getProfile(id),
    listByAuthorPublic(id),
    getCurrentUser(),
  ])

  const isOwner = viewer?.id === id
  if (profile === null && works.length === 0 && !isOwner) notFound()

  const label = profile?.displayName ?? t(locale, 'author.empty')

  return (
    <div className="min-h-screen bg-app">
      <AppHeader />
      <main className="px-4 py-10">
        <div className="mx-auto flex max-w-4xl flex-col gap-6">
          <div className="flex items-center gap-3">
            <Avatar seed={id} label={label} url={profile?.avatarUrl ?? null} size="lg" />
            <div className="flex flex-col gap-1">
              <h1 className="font-display text-2xl font-semibold text-ink" data-testid="public-profile-name">
                {label}
              </h1>
              {profile?.bio ? (
                <p data-testid="public-profile-bio" className="max-w-[60ch] text-sm text-ink-secondary">
                  {profile.bio}
                </p>
              ) : null}
              {profile?.website ? (
                <a
                  href={profile.website}
                  target="_blank"
                  rel="noreferrer nofollow ugc"
                  data-testid="public-profile-website"
                  className="w-fit text-sm text-accent hover:underline"
                >
                  {profile.website}
                </a>
              ) : null}
            </div>
          </div>

          {works.length === 0 ? (
            <p data-testid="public-profile-empty" className="text-sm text-ink-secondary">
              {t(locale, 'profile.public.empty')}
            </p>
          ) : (
            <div data-testid="public-profile-grid" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {works.map((card) => (
                <GalleryCard key={card.id} locale={locale} card={card} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

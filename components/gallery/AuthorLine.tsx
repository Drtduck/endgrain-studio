import Link from 'next/link'
import { Avatar } from '@/components/account/Avatar'
import type { GalleryCardAuthor } from '@/lib/gallery/types'
import { t, type Locale } from '@/lib/i18n'

/**
 * Строка автора: аватар-инициал плюс имя, ссылка на публичный профиль
 * /u/[id]. Автор без display_name (профиль ещё не заполнялся) показывает
 * общую подпись «автор» вместо пустой строки - молчаливая пустота выглядела
 * бы как баг карточки, а не как незаполненный профиль.
 */
export function AuthorLine({ locale, author }: { readonly locale: Locale; readonly author: GalleryCardAuthor }) {
  const label = author.displayName ?? t(locale, 'author.empty')
  return (
    <Link
      href={`/u/${author.id}`}
      data-testid="author-line"
      className="flex items-center gap-1.5 text-[12px] text-ink-secondary transition-colors duration-hover hover:text-ink"
    >
      <Avatar seed={author.id} label={label} size="sm" />
      <span className="truncate">
        {t(locale, 'author.by')} {label}
      </span>
    </Link>
  )
}

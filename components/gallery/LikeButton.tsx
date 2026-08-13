'use client'

import { useState, useTransition } from 'react'
import { Heart } from 'lucide-react'
import { likeAction, unlikeAction } from '@/app/actions/gallery'
import { Button } from '@/components/ui/button'
import { t, type Locale } from '@/lib/i18n'
import { cn } from '@/lib/utils'

export function LikeButton({
  locale,
  publishedId,
  initialLiked,
  initialCount,
}: {
  readonly locale: Locale
  readonly publishedId: string
  readonly initialLiked: boolean
  readonly initialCount: number
}) {
  const [liked, setLiked] = useState(initialLiked)
  const [count, setCount] = useState(initialCount)
  const [pending, startTransition] = useTransition()

  const toggle = (): void => {
    const nextLiked = !liked
    // Оптимистичный апдейт: счётчик реально двигает триггер в базе, но человек
    // не должен ждать круговой рейс до отклика на клик.
    setLiked(nextLiked)
    setCount((prev) => prev + (nextLiked ? 1 : -1))
    startTransition(async () => {
      const res = nextLiked ? await likeAction(publishedId) : await unlikeAction(publishedId)
      if (!res.ok) {
        // Откат при неудаче (не вошёл, сбой сети): счётчик не должен разъехаться с базой.
        setLiked(!nextLiked)
        setCount((prev) => prev - (nextLiked ? 1 : -1))
      }
    })
  }

  return (
    <Button
      size="sm"
      variant={liked ? 'default' : 'outline'}
      data-testid="gallery-like"
      aria-pressed={liked}
      disabled={pending}
      onClick={toggle}
    >
      <Heart data-icon="inline-start" className={cn(liked ? 'fill-current' : undefined)} />
      {t(locale, liked ? 'gallery.liked' : 'gallery.like')} · {count}
    </Button>
  )
}

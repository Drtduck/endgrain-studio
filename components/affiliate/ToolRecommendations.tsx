'use client'

import { Hammer } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { itemUrl } from '@/lib/affiliate'
import { recommendProducts } from '@/lib/affiliate/recommend'
import { t } from '@/lib/i18n'
import { useDerived } from '@/lib/store/derived'
import { selectDesign, useStudio } from '@/lib/store/studio'

/**
 * Контекстная подборка рядом с раскроем: не витрина всего каталога, а ответ на
 * вопрос «что понадобится именно для этой доски». Правила живут в чистой функции
 * recommendProducts, здесь только вёрстка и партнёрская разметка ссылок.
 */
export function ToolRecommendations() {
  const design = useStudio(selectDesign)
  const locale = useStudio((s) => s.locale)
  const { model, calc } = useDerived()
  const items = recommendProducts({ design, model, calc })

  if (items.length === 0) return null

  return (
    <Card data-testid="tool-recommendations" aria-label={t(locale, 'recommend.title')}>
      <CardHeader>
        <div className="flex items-center gap-1.5">
          <Hammer className="size-3.5 text-ink-muted" aria-hidden="true" />
          <CardTitle>{t(locale, 'recommend.title')}</CardTitle>
        </div>
        <p className="text-[13px] text-ink-muted">{t(locale, 'recommend.subtitle')}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <ul className="flex flex-col gap-2">
          {items.map(({ item, reason }) => (
            <li key={item.id}>
              <a
                href={itemUrl(item)}
                target="_blank"
                rel="sponsored noopener noreferrer"
                data-testid={`recommend-${item.id}`}
                className="flex flex-col gap-0.5 rounded-md border border-line-subtle bg-surface-raised px-3 py-2 transition-[box-shadow,border-color] duration-hover ease-out hover:border-accent-border hover:shadow-sm"
              >
                <span className="text-[11px] font-medium tracking-[0.08em] text-ink-muted uppercase">
                  {t(locale, `recommend.reason.${reason}`)}
                </span>
                <span className="text-[13px] font-semibold">{item.title[locale]}</span>
                <span className="font-mono text-[10px] text-ink-secondary">{t(locale, `affiliate.price.${item.band}`)}</span>
              </a>
            </li>
          ))}
        </ul>
        <p data-testid="recommend-disclosure" className="text-xs text-ink-muted">
          {t(locale, 'affiliate.disclosure')}
        </p>
      </CardContent>
    </Card>
  )
}

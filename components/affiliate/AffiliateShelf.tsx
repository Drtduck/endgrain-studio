'use client'

import { Wrench } from 'lucide-react'
import { itemUrl, PRODUCTS } from '@/lib/affiliate'
import { t } from '@/lib/i18n'
import { useStudio } from '@/lib/store/studio'

/**
 * Свёрнутая по умолчанию полка партнёрских товаров Amazon. Нативный <details>
 * даёт клавиатуру и скринридер бесплатно; закрытое состояние скрывает и
 * карточки, и дисклеймер, пока пользователь сам не откроет блок.
 */
export function AffiliateShelf() {
  const locale = useStudio((s) => s.locale)

  return (
    <details data-testid="affiliate-shelf" className="rounded-lg border border-line-subtle bg-surface-raised">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 select-none [&::-webkit-details-marker]:hidden">
        <Wrench className="size-4 text-ink-secondary" aria-hidden="true" />
        <span className="text-sm font-semibold">{t(locale, 'affiliate.tools.title')}</span>
        <span className="ml-auto font-mono text-[11px] text-ink-muted">{PRODUCTS.length}</span>
      </summary>

      <div className="flex flex-col gap-4 border-t border-line-subtle px-4 pt-4 pb-4">
        <p className="text-[13px] text-ink-secondary">{t(locale, 'affiliate.tools.subtitle')}</p>

        <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
          {PRODUCTS.map((item) => (
            <li key={item.id}>
              <a
                href={itemUrl(item)}
                target="_blank"
                rel="sponsored noopener noreferrer"
                data-testid={`product-card-${item.id}`}
                className="flex h-full flex-col gap-1.5 rounded-lg border border-line-subtle bg-surface-raised p-3 shadow-sm transition-[box-shadow,border-color] duration-hover ease-out hover:border-accent-border hover:shadow-md"
              >
                <span className="text-[11px] font-medium tracking-[0.08em] text-ink-muted uppercase">{item.brand}</span>
                <span className="text-sm font-semibold">{item.title[locale]}</span>
                <span className="text-[13px] text-ink-secondary">{item.note[locale]}</span>
                <span className="mt-auto w-fit rounded-full bg-surface-sunken px-2 py-0.5 font-mono text-[10px] text-ink-secondary">
                  {t(locale, `affiliate.price.${item.band}`)}
                </span>
              </a>
            </li>
          ))}
        </ul>

        <p data-testid="affiliate-disclosure" className="text-xs text-ink-muted">
          {t(locale, 'affiliate.disclosure')}
        </p>
      </div>
    </details>
  )
}

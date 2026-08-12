'use client'

import { ProductImage } from '@/components/affiliate/ProductImage'
import { BOOKS, itemUrl } from '@/lib/affiliate'
import { t } from '@/lib/i18n'
import { useStudio } from '@/lib/store/studio'

/** Вкладка «Литература»: восемь курированных книг, каждая со своей партнёрской ссылкой. */
export function LiteratureSection() {
  const locale = useStudio((s) => s.locale)

  return (
    <section
      data-testid="literature-section"
      aria-label={t(locale, 'affiliate.books.title')}
      className="flex flex-col gap-4"
    >
      <div>
        <h2 className="font-display text-2xl font-semibold">{t(locale, 'affiliate.books.title')}</h2>
        <p className="text-base text-ink-secondary">{t(locale, 'affiliate.books.subtitle')}</p>
      </div>

      <ul className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
        {BOOKS.map((book) => (
          <li key={book.id}>
            <a
              href={itemUrl(book)}
              target="_blank"
              rel="sponsored noopener noreferrer"
              data-testid={`book-card-${book.id}`}
              className="flex h-full flex-col gap-2 rounded-lg border border-line-subtle bg-surface-raised p-4 shadow-sm transition-[box-shadow,border-color] duration-hover ease-out hover:border-accent-border hover:shadow-md"
            >
              <span className="flex gap-3">
                <ProductImage
                  item={book}
                  alt={`${book.author}, ${book.title[locale]}`}
                  width={64}
                  height={92}
                  fit="cover"
                />
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="text-sm font-semibold">{book.title[locale]}</span>
                  <span className="font-mono text-[12px] text-ink-secondary">
                    {book.author}, {book.year}
                  </span>
                </span>
              </span>
              <span className="text-[13px] text-ink-secondary">{book.note[locale]}</span>

              <div className="mt-1 flex flex-col gap-1 border-l-2 border-accent-border pl-3">
                <span className="text-[10px] font-medium tracking-[0.08em] text-ink-muted uppercase">
                  {t(locale, 'affiliate.books.why')}
                </span>
                <span className="text-[13px] text-ink-secondary">{book.why[locale]}</span>
              </div>

              <span className="mt-auto w-fit rounded-full bg-surface-sunken px-2 py-0.5 font-mono text-[10px] text-ink-secondary">
                {t(locale, `affiliate.price.${book.band}`)}
              </span>
            </a>
          </li>
        ))}
      </ul>

      <p data-testid="affiliate-disclosure" className="text-xs text-ink-muted">
        {t(locale, 'affiliate.disclosure')}
      </p>
    </section>
  )
}

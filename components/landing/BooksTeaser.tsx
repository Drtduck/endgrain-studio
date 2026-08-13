import { BOOKS } from '@/lib/affiliate'
import { t, type Locale } from '@/lib/i18n'
import { APP_ORIGIN } from '@/lib/routing/host'

// Лёгкая витрина: три книги из полной подборки лежат во вкладке «Литература» приложения,
// ссылки на Amazon карточки не несут, чтобы на лендинге остался один явный CTA.
const TEASER = BOOKS.slice(0, 3)

export function BooksTeaser({ locale }: { locale: Locale }) {
  return (
    <section className="bg-canvas px-6 py-20" data-testid="landing-books">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-3xl tracking-tight text-ink">{t(locale, 'affiliate.books.title')}</h2>
            <p className="mt-2 max-w-[52ch] text-ink-secondary">{t(locale, 'affiliate.books.subtitle')}</p>
          </div>
          <a
            href={APP_ORIGIN}
            data-testid="landing-books-cta"
            className="rounded-md border border-line bg-surface-raised px-4 py-2 font-sans text-sm font-semibold text-ink transition-colors duration-hover hover:bg-app"
          >
            {t(locale, 'landing.books.viewAll')}
          </a>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {TEASER.map((book) => (
            <div
              key={book.id}
              data-testid={`landing-book-${book.id}`}
              className="eg-tilt flex flex-col gap-1.5 rounded-lg border border-line bg-surface-raised p-4"
            >
              <span className="text-sm font-semibold text-ink">{book.title[locale]}</span>
              <span className="font-mono text-[12px] text-ink-secondary">
                {book.author}, {book.year}
              </span>
              <p className="text-[13px] text-ink-secondary">{book.note[locale]}</p>
            </div>
          ))}
        </div>

        <p className="mt-6 text-xs text-ink-muted">{t(locale, 'affiliate.disclosure')}</p>
      </div>
    </section>
  )
}

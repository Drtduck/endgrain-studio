import { SubscribeForm } from '@/components/landing/SubscribeForm'
import { t, type Locale } from '@/lib/i18n'

/**
 * Вставка формы подписки в середину статьи: та же форма и тот же action
 * (subscribeAction, Kit), что и в SubscribeSection на лендинге, но с
 * заголовком-крючком под контекст чтения статьи, а не общей подписью сайта.
 * locale статьи фиксирован в meta.lang, поэтому передаётся явно из MDX
 * (`<NewsletterBreak locale="ru" />`), а не берётся из читателя.
 */
export function NewsletterBreak({ locale }: { locale: Locale }) {
  return (
    <aside
      data-testid="blog-newsletter-break"
      className="mt-8 rounded-lg border border-accent-border bg-accent-soft p-5 sm:p-6"
    >
      <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
        {t(locale, 'blog.newsletter.title')}
      </h2>
      <p className="mt-2 max-w-[52ch] font-sans text-sm text-ink-secondary">{t(locale, 'blog.newsletter.body')}</p>
      <div className="mt-4">
        <SubscribeForm locale={locale} />
      </div>
    </aside>
  )
}

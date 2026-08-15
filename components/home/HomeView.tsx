'use client'

import { HowToGuide } from '@/components/home/HowToGuide'
import { useSession } from '@/components/SessionProvider'
import { t, type MessageKey } from '@/lib/i18n'
import { useStudio, type StudioView } from '@/lib/store/studio'

interface HomeCard {
  readonly view: Exclude<StudioView, 'home'>
  readonly titleKey: MessageKey
  readonly bodyKey: MessageKey
}

const CARDS: readonly HomeCard[] = [
  { view: 'editor', titleKey: 'home.card.editor.title', bodyKey: 'home.card.editor.body' },
  { view: 'templates', titleKey: 'home.card.templates.title', bodyKey: 'home.card.templates.body' },
  { view: 'generate', titleKey: 'home.card.generate.title', bodyKey: 'home.card.generate.body' },
  { view: 'photo', titleKey: 'home.card.photo.title', bodyKey: 'home.card.photo.body' },
  { view: 'view3d', titleKey: 'home.card.view3d.title', bodyKey: 'home.card.view3d.body' },
  { view: 'books', titleKey: 'home.card.books.title', bodyKey: 'home.card.books.body' },
  { view: 'promo', titleKey: 'home.card.promo.title', bodyKey: 'home.card.promo.body' },
]

const PROJECTS_CARD: HomeCard = {
  view: 'projects',
  titleKey: 'home.card.projects.title',
  bodyKey: 'home.card.projects.body',
}

/**
 * Имя для приветствия - часть почты до собаки: другого имени у нас нет,
 * Supabase отдаёт только id и email. Первая буква поднимается в заглавную,
 * чтобы «drtloki» читалось как обращение, а не как логин в базе.
 */
export function greetingName(email: string): string {
  const local = email.split('@')[0]?.trim() ?? ''
  if (local.length === 0) return ''
  return local[0]!.toUpperCase() + local.slice(1)
}

export function HomeView() {
  const locale = useStudio((s) => s.locale)
  const setView = useStudio((s) => s.setView)
  const { user, enabled } = useSession()

  // Облачные проекты показываем ровно там же, где живёт вкладка (см. StudioTabs):
  // гостю карточка вела бы в пустой экран с просьбой войти.
  const signedIn = enabled && user !== null
  const name = signedIn ? greetingName(user.email) : ''
  const cards = signedIn ? [...CARDS, PROJECTS_CARD] : CARDS

  return (
    <section data-testid="home-view" className="flex flex-col gap-8">
      <header className="flex items-start gap-4">
        <img src="/brand/icons/home.png" alt="" width={48} height={48} className="hidden size-12 shrink-0 sm:block" />
        <div className="flex min-w-0 flex-col gap-1">
          <h1 data-testid="home-greeting" className="font-display text-2xl tracking-tight text-ink sm:text-3xl">
            {name.length > 0 ? t(locale, 'home.greeting', { name }) : t(locale, 'home.greetingGuest')}
          </h1>
          <p className="max-w-2xl text-[13px] text-ink-secondary sm:text-sm">{t(locale, 'home.subtitle')}</p>
        </div>
      </header>

      <HowToGuide />

      <div className="flex flex-col gap-4">
        <h2 className="font-display text-lg text-ink-secondary">{t(locale, 'home.sections')}</h2>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <button
              key={card.view}
              type="button"
              data-testid={`home-card-${card.view}`}
              onClick={() => setView(card.view)}
              className="eg-tilt flex min-w-0 flex-col items-start gap-2 rounded-lg border border-line bg-surface-raised p-5 text-left transition-colors duration-hover ease-out hover:border-accent-border focus-visible:shadow-focus focus-visible:outline-none"
            >
              <img src={`/brand/icons/${card.view}.png`} alt="" width={48} height={48} className="size-12 shrink-0" />
              <h3 className="font-display text-lg text-ink">{t(locale, card.titleKey)}</h3>
              <p className="text-[13px] text-ink-secondary">{t(locale, card.bodyKey)}</p>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

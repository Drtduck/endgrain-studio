'use client'

import { useState, useTransition } from 'react'
import {
  deleteProjectAction,
  listProjectsAction,
  loadProjectAction,
  saveProjectAction,
  type ProjectsError,
} from '@/app/actions/projects'
import { CreditCard } from 'lucide-react'
import { usePro } from '@/components/ProProvider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PublishForm } from '@/components/gallery/PublishForm'
import { track } from '@/lib/analytics/events'
import { designDisplayName } from '@/lib/designs/name'
import { t, type MessageKey } from '@/lib/i18n'
import { FREE_PROJECT_LIMIT } from '@/lib/stripe/limits'
import { useProjectsStore } from '@/lib/store/projects'
import { selectDesign, useStudio } from '@/lib/store/studio'

const ERROR_KEYS: Readonly<Record<ProjectsError, MessageKey>> = {
  unauthenticated: 'projects.errorAuth',
  invalid: 'projects.errorInvalid',
  notFound: 'projects.errorNotFound',
  failed: 'projects.errorFailed',
  limit: 'projects.errorLimit',
}

export function ProjectsPanel() {
  const locale = useStudio((s) => s.locale)
  const design = useStudio(selectDesign)
  const loadDesign = useStudio((s) => s.loadDesign)
  const markProjectSaved = useStudio((s) => s.markProjectSaved)
  const setView = useStudio((s) => s.setView)
  const { status, billingEnabled } = usePro()

  // Список - общий стор (мелочь 2, приёмка 15.08.2026), не локальный useState:
  // SaveProjectButton в редакторе пишет успешное сохранение сюда же, и список
  // не отстаёт от реальности, когда человек переключается на вкладку «Проекты».
  const items = useProjectsStore((s) => s.items)
  const loaded = useProjectsStore((s) => s.loaded)
  const setItems = useProjectsStore((s) => s.setItems)
  const upsertItem = useProjectsStore((s) => s.upsertItem)
  const removeItem = useProjectsStore((s) => s.removeItem)
  const markLoaded = useProjectsStore((s) => s.markLoaded)
  // Имя из документа пересчитывается на каждый рендер и подставляется заново, когда оно
  // изменилось: иначе в облако уезжало имя на языке момента открытия вкладки, а после
  // загрузки другого проекта - имя предыдущего. Правка состояния прямо в рендере, а не в
  // эффекте, сознательно: это штатный приём React для сброса состояния по смене входа.
  const suggestedName = designDisplayName(design, locale)
  const [name, setName] = useState(suggestedName)
  const [lastSuggestedName, setLastSuggestedName] = useState(suggestedName)
  if (lastSuggestedName !== suggestedName) {
    setLastSuggestedName(suggestedName)
    setName(suggestedName)
  }
  const [error, setError] = useState<ProjectsError | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const refresh = (): void => {
    setError(null)
    startTransition(async () => {
      const res = await listProjectsAction()
      if (res.ok) setItems(res.data)
      else {
        markLoaded()
        setError(res.error)
      }
    })
  }

  // Автозагрузки по эффекту нет сознательно: правило react-hooks/set-state-in-effect
  // видит setState внутри refresh() даже через async-колбэк startTransition и падает
  // на build. Это допустимая деградация UX (см. задачу 4 брифа фазы 7): список грузится
  // по явному клику на "Обновить список", подсказка ниже написана нейтрально и не
  // подразумевает, что загрузка уже случилась сама.
  //
  // Список - общий стор lib/store/projects.ts (мелочь 2, приёмка 15.08.2026): и
  // здесь, и в SaveProjectButton (кнопка в редакторе) успешное сохранение пишет
  // upsertItem в тот же стор, поэтому список не отстаёт от реальности, когда
  // человек переключается на вкладку «Проекты» - без единого лишнего эффекта.
  const onSave = (): void => {
    setError(null)
    const currentName = name
    const currentDesign = design
    startTransition(async () => {
      const res = await saveProjectAction(currentName, currentDesign)
      if (res.ok) {
        upsertItem(res.data)
        // Синхронизируем со стором: повторное сохранение (в том числе кнопкой в редакторе)
        // обновит именно этот проект, а не заведёт рядом ещё одну копию.
        markProjectSaved(res.data.id, currentDesign)
        track('project_saved')
      } else {
        setError(res.error)
      }
    })
  }

  const onLoad = (id: string): void => {
    setError(null)
    startTransition(async () => {
      const res = await loadProjectAction(id)
      if (res.ok) {
        loadDesign(res.data)
        // loadDesign выше сбрасывает привязку к проекту (она для generic-загрузок), здесь же
        // грузится именно ЭТОТ облачный проект - привязку ставим следом тем же документом.
        markProjectSaved(id, res.data)
        setView('editor')
      } else {
        setError(res.error)
      }
    })
  }

  const onDelete = (id: string): void => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id)
      return
    }
    setConfirmDeleteId(null)
    setError(null)
    startTransition(async () => {
      const res = await deleteProjectAction(id)
      if (res.ok) {
        removeItem(id)
      } else {
        setError(res.error)
      }
    })
  }

  const dateFormatter = new Intl.DateTimeFormat(locale)

  return (
    <section
      data-testid="projects-panel"
      aria-label={t(locale, 'aria.projectsPanel')}
      className="flex flex-col gap-4"
    >
      <div>
        <h2 className="font-display text-2xl font-semibold">{t(locale, 'projects.title')}</h2>
        <p className="text-base text-ink-secondary">{t(locale, 'projects.subtitle')}</p>
      </div>

      {/* Кошелёк и счётчик кадров переехали в аккаунт (раздел 6 спеки pricing-wallet.md):
          он там оказался случайно, человек ищет деньги в аккаунте, а не в списке досок. */}
      <a
        href="/account/billing"
        data-testid="projects-billing-link"
        className="flex items-center gap-2 rounded-lg border border-line-subtle bg-surface-raised px-4 py-3 text-sm font-medium text-accent hover:underline"
      >
        <CreditCard aria-hidden className="size-4 shrink-0" />
        {t(locale, 'account.billing')}
      </a>

      <div className="flex flex-col gap-2 rounded-lg border border-line-subtle bg-surface-raised p-4">
        <h3 className="text-sm font-semibold">{t(locale, 'projects.saveTitle')}</h3>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="projects-name" className="text-[11px] text-ink-muted">
              {t(locale, 'projects.name')}
            </label>
            <Input
              id="projects-name"
              data-testid="projects-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={pending}
              className="w-64"
            />
          </div>
          <Button data-testid="projects-save" onClick={onSave} disabled={pending}>
            {pending ? t(locale, 'projects.busy') : t(locale, 'projects.save')}
          </Button>
        </div>
        {/* Счётчик мест показываем, только когда касса работает и лимит реально действует. */}
        {!status.pro && billingEnabled ? (
          <p data-testid="projects-limit-hint" className="text-[11px] text-ink-muted">
            {t(locale, 'projects.limitHint', { used: items.length, limit: FREE_PROJECT_LIMIT })}
          </p>
        ) : null}
      </div>

      {error ? (
        <p role="alert" data-testid="projects-error" className="text-sm text-error-text">
          {t(locale, ERROR_KEYS[error])}
        </p>
      ) : null}

      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-medium tracking-[0.12em] text-ink-muted uppercase">
          {t(locale, 'projects.title')}
        </h3>
        <Button variant="outline" size="sm" data-testid="projects-refresh" onClick={refresh} disabled={pending}>
          {t(locale, 'projects.refresh')}
        </Button>
      </div>

      {loaded && items.length === 0 ? (
        <p className="text-sm text-ink-secondary">{t(locale, 'projects.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line-subtle bg-surface-raised px-3 py-2.5"
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold">{item.name}</span>
                <span className="font-mono text-[11px] text-ink-muted tabular-nums">
                  {t(locale, 'projects.updatedAt', { date: dateFormatter.format(new Date(item.updatedAt)) })}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  data-testid={`project-load-${item.id}`}
                  onClick={() => onLoad(item.id)}
                  disabled={pending}
                >
                  {t(locale, 'projects.load')}
                </Button>
                <PublishForm locale={locale} projectId={item.id} defaultTitle={item.name} />
                <Button
                  variant="destructive"
                  size="sm"
                  data-testid={`project-delete-${item.id}`}
                  onClick={() => onDelete(item.id)}
                  disabled={pending}
                >
                  {confirmDeleteId === item.id ? t(locale, 'projects.deleteConfirm') : t(locale, 'projects.delete')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

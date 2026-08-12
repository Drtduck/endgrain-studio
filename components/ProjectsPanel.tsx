'use client'

import { useState, useTransition } from 'react'
import {
  deleteProjectAction,
  listProjectsAction,
  loadProjectAction,
  saveProjectAction,
  type ProjectsError,
} from '@/app/actions/projects'
import { usePro } from '@/components/ProProvider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { t, type MessageKey } from '@/lib/i18n'
import { FREE_PROJECT_LIMIT } from '@/lib/stripe/limits'
import { selectDesign, useStudio } from '@/lib/store/studio'
import type { ProjectSummary } from '@/lib/supabase/types'

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
  const setView = useStudio((s) => s.setView)
  const { status, billingEnabled } = usePro()

  const [items, setItems] = useState<readonly ProjectSummary[]>([])
  const [loaded, setLoaded] = useState(false)
  const [name, setName] = useState(design.name)
  const [error, setError] = useState<ProjectsError | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const refresh = (): void => {
    setError(null)
    startTransition(async () => {
      const res = await listProjectsAction()
      setLoaded(true)
      if (res.ok) setItems(res.data)
      else setError(res.error)
    })
  }

  // Автозагрузки по эффекту нет сознательно: правило react-hooks/set-state-in-effect
  // видит setState внутри refresh() даже через async-колбэк startTransition и падает
  // на build. Это допустимая деградация UX (см. задачу 4 брифа фазы 7): список грузится
  // по явному клику на "Обновить список", подсказка ниже написана нейтрально и не
  // подразумевает, что загрузка уже случилась сама.
  const onSave = (): void => {
    setError(null)
    const currentName = name
    const currentDesign = design
    startTransition(async () => {
      const res = await saveProjectAction(currentName, currentDesign)
      if (res.ok) {
        setItems((prev) => [res.data, ...prev])
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
        setItems((prev) => prev.filter((item) => item.id !== id))
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
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  data-testid={`project-load-${item.id}`}
                  onClick={() => onLoad(item.id)}
                  disabled={pending}
                >
                  {t(locale, 'projects.load')}
                </Button>
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

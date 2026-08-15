'use client'

import { useState, useTransition } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { upsertProjectAction, type ProjectsError } from '@/app/actions/projects'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { track } from '@/lib/analytics/events'
import { loginRedirectPath } from '@/lib/auth/access'
import { designDisplayName } from '@/lib/designs/name'
import { t, type MessageKey } from '@/lib/i18n'
import { selectDesign, selectProjectSaveStatus, useStudio } from '@/lib/store/studio'

/**
 * Коды из saveProjectAction/updateProjectAction без 'unauthenticated': тот случай рисует
 * отдельную ссылку на вход, а не абзац с общей ошибкой (см. onSave ниже).
 */
const ERROR_KEYS: Readonly<Record<Exclude<ProjectsError, 'unauthenticated'>, MessageKey>> = {
  invalid: 'projectSave.errorInvalid',
  notFound: 'projectSave.errorNotFound',
  failed: 'projectSave.errorFailed',
  limit: 'projectSave.errorLimit',
}

/**
 * Кнопка «Сохранить проект» в правой колонке редактора: облачное сохранение раньше жило
 * только на вкладке «Проекты», до которой ещё нужно было дойти. Здесь она рядом с экспортом,
 * там, где человек и так смотрит после того, как собрал доску.
 *
 * Create-or-update: currentProjectId в сторе появляется после первого успешного сохранения
 * (или загрузки своего проекта из ProjectsPanel) и переживает переключение вкладок студии -
 * повторное нажатие бьёт по upsertProjectAction (атомарный UPDATE-or-INSERT на сервере)
 * и не плодит дубли в облаке, даже если два клика или две вкладки гонятся одновременно.
 */
export function SaveProjectButton() {
  const locale = useStudio((s) => s.locale)
  const design = useStudio(selectDesign)
  const currentProjectId = useStudio((s) => s.currentProjectId)
  const saveStatus = useStudio(selectProjectSaveStatus)
  const markProjectSaved = useStudio((s) => s.markProjectSaved)
  const pathname = usePathname()

  const [error, setError] = useState<ProjectsError | null>(null)
  const [pending, startTransition] = useTransition()

  const onSave = (): void => {
    setError(null)
    const name = designDisplayName(design, locale)
    const idAtClick = currentProjectId
    const designAtClick = design
    startTransition(async () => {
      const res = await upsertProjectAction({ projectId: idAtClick, name, design: designAtClick })
      if (res.ok) {
        markProjectSaved(res.data.id, designAtClick)
        track('project_saved')
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <Card aria-label={t(locale, 'aria.projectSavePanel')}>
      <CardHeader>
        <CardTitle className="text-base">{t(locale, 'projectSave.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Button size="sm" data-testid="project-save" onClick={onSave} disabled={pending}>
          {pending ? t(locale, 'projectSave.busy') : t(locale, 'projectSave.button')}
        </Button>

        {saveStatus !== 'none' ? (
          <p data-testid="project-save-status" className="text-[13px] text-ink-muted">
            {t(locale, saveStatus === 'saved' ? 'projectSave.saved' : 'projectSave.dirty')}
          </p>
        ) : null}

        {error === 'unauthenticated' ? (
          <p
            data-testid="project-save-error"
            role="alert"
            className="flex flex-wrap items-center gap-2 rounded-md border border-line-subtle bg-surface-raised px-3 py-[11px] text-[13px] text-ink-secondary"
          >
            <span>{t(locale, 'projectSave.authRequired')}</span>
            <Link
              href={loginRedirectPath(pathname ?? '/', '')}
              data-testid="project-save-login"
              className="font-semibold text-accent underline-offset-4 hover:underline"
            >
              {t(locale, 'auth.signIn')}
            </Link>
          </p>
        ) : error ? (
          <p role="alert" data-testid="project-save-error" className="text-sm text-error-text">
            {t(locale, ERROR_KEYS[error])}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

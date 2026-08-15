'use client'

import { useCallback, useRef, useState } from 'react'
import { upsertProjectAction, type ProjectsError } from '@/app/actions/projects'
import { useSession } from '@/components/SessionProvider'
import { designDisplayName } from '@/lib/designs/name'
import { selectDesign, useStudio } from '@/lib/store/studio'

/**
 * ПРИМЕЧАНИЕ О РАСПОЛОЖЕНИИ: спека docs/specs/promo-studio.md (раздел 3.4)
 * кладёт этот хук в lib/promo/useProjectGuard.ts. Он живёт здесь, в
 * lib/projects/, потому что каталог lib/promo/** в этой волне работ ведёт
 * параллельный агент (промо-студия, P0-3+) - трогать его нельзя. Сам хук не
 * содержит ничего промо-специфичного: он только гарантирует, что текущий
 * документ лежит в облаке. Следующий агент, который подключает вызов из
 * промо-панели, импортирует его отсюда (или переносит в lib/promo/, если
 * к тому моменту конфликт снят).
 *
 * Правило железное (docs/specs/promo-studio.md, раздел 3.4): платное действие
 * не должно уйти без projectId - иначе оплаченному кадру негде лежать.
 * ensureSaved() это единственная точка, которая это гарантирует.
 */

export type ProjectGuardState =
  | { readonly kind: 'ready'; readonly projectId: string; readonly projectName: string }
  | { readonly kind: 'anonymous' }
  | { readonly kind: 'saving' }
  | { readonly kind: 'unsaved' }
  | { readonly kind: 'failed'; readonly error: ProjectsError }

export interface ProjectGuard {
  readonly state: ProjectGuardState
  /**
   * Гарантирует, что перед платным действием документ лежит в облаке.
   * Возвращает projectId или null, если сохранить не вышло. Платное действие
   * при null НЕ запускается: генерировать в никуда мы больше не будем.
   *
   * Если currentProjectId уже есть в сторе, ensureSaved НЕ шлёт лишний запрос -
   * документ уже привязан к проекту (upsertProjectAction создаст новую строку,
   * только если id окажется чужим/удалённым, это его забота, не хука).
   */
  ensureSaved(): Promise<string | null>
}

export function useProjectGuard(): ProjectGuard {
  const { user } = useSession()
  const locale = useStudio((s) => s.locale)
  const design = useStudio(selectDesign)
  const currentProjectId = useStudio((s) => s.currentProjectId)
  const markProjectSaved = useStudio((s) => s.markProjectSaved)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<ProjectsError | null>(null)
  // Одновременные вызовы ensureSaved (двойной клик по кнопке генерации) не должны
  // уйти в два параллельных INSERT: второй вызов ждёт тот же промис, что и первый.
  const inFlight = useRef<Promise<string | null> | null>(null)

  const ensureSaved = useCallback(async (): Promise<string | null> => {
    if (!user) return null
    if (currentProjectId) return currentProjectId
    if (inFlight.current) return inFlight.current

    const name = designDisplayName(design, locale)
    const designAtCall = design
    const run = (async (): Promise<string | null> => {
      setSaving(true)
      setError(null)
      try {
        const res = await upsertProjectAction({ projectId: null, name, design: designAtCall })
        if (res.ok) {
          markProjectSaved(res.data.id, designAtCall)
          return res.data.id
        }
        setError(res.error)
        return null
      } finally {
        setSaving(false)
        inFlight.current = null
      }
    })()
    inFlight.current = run
    return run
  }, [user, currentProjectId, design, locale, markProjectSaved])

  // 'saving' и 'unsaved' разведены отдельно (правка UX-приёмки 15.08.2026): раньше
  // "документ ещё ни разу не сохранён, ensureSaved ещё не вызывался" тоже красился
  // в 'saving', и плашка над кнопкой генерации бесконечно врала «Сохраняем...», хотя
  // никакой запрос не летел. Платное действие всё так же не запускается без
  // projectId ни в 'saving', ни в 'unsaved' - разница только в тексте для человека:
  // 'saving' значит "запрос реально в полёте", 'unsaved' - "сохранится при первой генерации".
  const state: ProjectGuardState = !user
    ? { kind: 'anonymous' }
    : saving
      ? { kind: 'saving' }
      : error
        ? { kind: 'failed', error }
        : currentProjectId
          ? { kind: 'ready', projectId: currentProjectId, projectName: designDisplayName(design, locale) }
          : { kind: 'unsaved' }

  return { state, ensureSaved }
}

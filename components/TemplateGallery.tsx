'use client'

import { useState } from 'react'
import { BoardSvg } from '@/components/BoardSvg'
import { ConfirmReplace } from '@/components/ConfirmReplace'
import { compile, type BoardModel } from '@/lib/engine'
import { TEMPLATES, TEMPLATE_GROUPS, groupNameKey, type BoardTemplate } from '@/lib/designs/templates'
import { t } from '@/lib/i18n'
import { selectIsDirty, useStudio } from '@/lib/store/studio'

/**
 * Превью считаются один раз на модуль: документы шаблонов неизменяемы,
 * поэтому переключение вкладки не должно каждый раз перекомпилировать 16 досок.
 */
const PREVIEWS: ReadonlyMap<string, BoardModel> = new Map(
  TEMPLATES.map((tpl) => [tpl.id, compile(tpl.build())]),
)

export function TemplateGallery() {
  const locale = useStudio((s) => s.locale)
  const loadDesign = useStudio((s) => s.loadDesign)
  const setView = useStudio((s) => s.setView)
  const dirty = useStudio(selectIsDirty)
  const [pending, setPending] = useState<BoardTemplate | null>(null)

  const apply = (tpl: BoardTemplate): void => {
    // Загрузка шаблона обнуляет историю правок, поэтому имя фиксируем на языке пользователя сразу при применении.
    loadDesign({ ...tpl.build(), name: t(locale, tpl.nameKey) })
    setPending(null)
    setView('editor')
  }

  const onPick = (tpl: BoardTemplate): void => {
    // Загрузка шаблона обнуляет историю правок и заменяет документ, поэтому спрашиваем,
    // если в текущем документе уже есть реальная работа (не только историю правок:
    // восстановленный из localStorage/ссылки документ тоже нельзя тихо стереть).
    if (dirty) setPending(tpl)
    else apply(tpl)
  }

  return (
    <section
      data-testid="template-gallery"
      aria-label={t(locale, 'aria.templateGallery')}
      className="flex flex-col gap-4"
    >
      <div>
        <h2 className="text-lg font-semibold">{t(locale, 'templates.title')}</h2>
        <p className="text-sm text-muted-foreground">{t(locale, 'templates.subtitle')}</p>
      </div>

      {TEMPLATE_GROUPS.map((group) => {
        const items = TEMPLATES.filter((tpl) => tpl.group === group)
        if (items.length === 0) return null
        return (
          <div key={group} className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-muted-foreground">{t(locale, groupNameKey(group))}</h3>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((tpl) => {
                const model = PREVIEWS.get(tpl.id)
                return (
                  <li key={tpl.id}>
                    <button
                      type="button"
                      data-testid={`template-${tpl.id}`}
                      onClick={() => onPick(tpl)}
                      className="flex w-full cursor-pointer flex-col items-center gap-2 rounded-lg border p-2 text-center transition-colors hover:bg-muted"
                    >
                      {model ? <BoardSvg model={model} locale={locale} maxPx={140} /> : null}
                      <span className="text-sm font-medium">{t(locale, tpl.nameKey)}</span>
                      {model ? (
                        <span className="text-xs text-muted-foreground">
                          {t(locale, 'templates.size', {
                            widthMm: Math.round(model.widthMm),
                            lengthMm: Math.round(model.lengthMm),
                          })}
                          {', '}
                          {t(locale, 'templates.glueUps', { count: model.glueUpCount })}
                        </span>
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}

      {pending ? (
        <ConfirmReplace
          testId="template"
          title={t(locale, 'templates.confirmTitle')}
          body={t(locale, 'templates.confirmBody', { name: t(locale, pending.nameKey) })}
          confirmLabel={t(locale, 'templates.confirmApply')}
          cancelLabel={t(locale, 'templates.confirmCancel')}
          onConfirm={() => apply(pending)}
          onCancel={() => setPending(null)}
        />
      ) : null}
    </section>
  )
}

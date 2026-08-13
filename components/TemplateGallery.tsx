'use client'

import { useState } from 'react'
import { AffiliateShelf } from '@/components/affiliate/AffiliateShelf'
import { BoardSvg } from '@/components/BoardSvg'
import { ConfirmReplace } from '@/components/ConfirmReplace'
import { Badge } from '@/components/ui/badge'
import { HelpHint } from '@/components/ui/help-hint'
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
    // Имя приезжает ключом внутри документа, поэтому шаблон переводится вместе с интерфейсом.
    loadDesign(tpl.build())
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
        <div className="flex items-center gap-1.5">
          <h2 className="font-display text-2xl font-semibold">{t(locale, 'templates.title')}</h2>
          <HelpHint id="templates" side="bottom" />
        </div>
        <p className="text-base text-ink-secondary">{t(locale, 'templates.subtitle')}</p>
      </div>

      {TEMPLATE_GROUPS.map((group) => {
        const items = TEMPLATES.filter((tpl) => tpl.group === group)
        if (items.length === 0) return null
        return (
          <div key={group} className="flex flex-col gap-2">
            <h3 className="text-[11px] font-medium tracking-[0.12em] text-ink-muted uppercase">
              {t(locale, groupNameKey(group))}
            </h3>
            <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]">
              {items.map((tpl) => {
                const model = PREVIEWS.get(tpl.id)
                return (
                  <li key={tpl.id}>
                    <button
                      type="button"
                      data-testid={`template-${tpl.id}`}
                      onClick={() => onPick(tpl)}
                      className="flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-lg border border-line-subtle bg-surface-raised text-left shadow-sm transition-[box-shadow,border-color] duration-hover ease-out hover:border-accent-border hover:shadow-md"
                    >
                      <div className="flex items-center justify-center bg-surface-panel p-2.5">
                        {model ? <BoardSvg model={model} locale={locale} maxPx={140} /> : null}
                      </div>
                      <div className="flex flex-col gap-1 border-t border-line-subtle px-3 py-2.5">
                        <span className="text-sm font-semibold">{t(locale, tpl.nameKey)}</span>
                        {model ? (
                          <div className="flex items-center gap-1.5">
                            <Badge>{t(locale, 'templates.glueUps', { count: model.glueUpCount })}</Badge>
                            <span className="font-mono text-[10px] text-ink-muted tabular-nums">
                              {t(locale, 'templates.size', {
                                widthMm: Math.round(model.widthMm),
                                lengthMm: Math.round(model.lengthMm),
                              })}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}

      <AffiliateShelf />

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

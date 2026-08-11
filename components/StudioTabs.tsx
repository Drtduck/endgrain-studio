'use client'

import { t, type MessageKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useStudio, type StudioView } from '@/lib/store/studio'

const TABS: readonly { readonly view: StudioView; readonly labelKey: MessageKey }[] = [
  { view: 'editor', labelKey: 'tabs.editor' },
  { view: 'templates', labelKey: 'tabs.templates' },
  { view: 'generate', labelKey: 'tabs.generate' },
  { view: 'photo', labelKey: 'tabs.photo' },
  { view: 'view3d', labelKey: 'tabs.view3d' },
]

export function StudioTabs() {
  const locale = useStudio((s) => s.locale)
  const view = useStudio((s) => s.view)
  const setView = useStudio((s) => s.setView)

  return (
    <div role="tablist" aria-label={t(locale, 'aria.tabs')} className="flex flex-wrap gap-1">
      {TABS.map((tab) => (
        <button
          key={tab.view}
          type="button"
          role="tab"
          data-testid={`tab-${tab.view}`}
          aria-selected={view === tab.view}
          onClick={() => setView(tab.view)}
          className={cn(
            'rounded-sm px-[13px] py-[7px] text-sm transition-colors duration-hover ease-out focus-visible:shadow-focus focus-visible:outline-none',
            view === tab.view
              ? 'bg-accent-soft font-semibold text-accent'
              : 'font-medium text-ink-secondary hover:bg-app hover:text-ink',
          )}
        >
          {t(locale, tab.labelKey)}
        </button>
      ))}
    </div>
  )
}

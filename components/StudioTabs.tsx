'use client'

import { Button } from '@/components/ui/button'
import { t, type MessageKey } from '@/lib/i18n'
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
        <Button
          key={tab.view}
          role="tab"
          data-testid={`tab-${tab.view}`}
          aria-selected={view === tab.view}
          size="sm"
          variant={view === tab.view ? 'default' : 'outline'}
          onClick={() => setView(tab.view)}
        >
          {t(locale, tab.labelKey)}
        </Button>
      ))}
    </div>
  )
}

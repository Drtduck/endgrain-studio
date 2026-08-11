'use client'

import { Board3DPanel } from '@/components/Board3DPanel'
import { BoardCanvas } from '@/components/BoardCanvas'
import { BoardSettings } from '@/components/BoardSettings'
import { ComplexityMeter } from '@/components/ComplexityMeter'
import { DiagnosticsPanel } from '@/components/DiagnosticsPanel'
import { ExportPanel } from '@/components/ExportPanel'
import { ForkDialog } from '@/components/ForkDialog'
import { GeneratorPanel } from '@/components/GeneratorPanel'
import { HistoryControls } from '@/components/HistoryControls'
import { LocaleToggle } from '@/components/LocaleToggle'
import { PanelInspector } from '@/components/PanelInspector'
import { PhotoImport } from '@/components/PhotoImport'
import { RowInspector } from '@/components/RowInspector'
import { SpeciesPalette } from '@/components/SpeciesPalette'
import { StudioTabs } from '@/components/StudioTabs'
import { TemplateGallery } from '@/components/TemplateGallery'
import { t } from '@/lib/i18n'
import { useDerived } from '@/lib/store/derived'
import { useStudioPersistence } from '@/lib/store/persist'
import { useStudio, type StudioView } from '@/lib/store/studio'

const FULL_WIDTH: readonly StudioView[] = ['templates', 'generate', 'photo']

export function StudioShell() {
  const locale = useStudio((s) => s.locale)
  const unit = useStudio((s) => s.unit)
  const view = useStudio((s) => s.view)
  const setLocale = useStudio((s) => s.setLocale)
  const { model, calc, diagnostics } = useDerived()
  useStudioPersistence()

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t(locale, 'app.title')}</h1>
          <p className="text-sm text-muted-foreground">{t(locale, 'app.tagline')}</p>
        </div>
        <div className="flex items-center gap-2">
          <HistoryControls />
          <LocaleToggle locale={locale} onChange={setLocale} />
        </div>
      </header>

      <StudioTabs />

      {FULL_WIDTH.includes(view) ? (
        view === 'templates' ? <TemplateGallery /> : view === 'generate' ? <GeneratorPanel /> : <PhotoImport />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex flex-col gap-4">
            {view === 'view3d' ? (
              <Board3DPanel />
            ) : (
              <>
                <section aria-label={t(locale, 'board.title')} className="overflow-x-auto">
                  <BoardCanvas />
                </section>
                <PanelInspector />
                <RowInspector />
              </>
            )}
          </div>

          <aside className="flex flex-col gap-4 lg:sticky lg:top-4 lg:max-h-screen lg:self-start lg:overflow-y-auto">
            <SpeciesPalette />
            <BoardSettings />
            <ComplexityMeter locale={locale} calc={calc} diagnostics={diagnostics} unit={unit} model={model} />
            <ExportPanel />
            <DiagnosticsPanel />
          </aside>
        </div>
      )}

      <ForkDialog />
    </main>
  )
}

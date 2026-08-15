'use client'

import { AppHeader } from '@/components/AppHeader'
import { LiteratureSection } from '@/components/affiliate/LiteratureSection'
import { ToolRecommendations } from '@/components/affiliate/ToolRecommendations'
import { Board3DPanel } from '@/components/Board3DPanel'
import { BoardCanvas } from '@/components/BoardCanvas'
import { BoardSettings } from '@/components/BoardSettings'
import { ComplexityMeter } from '@/components/ComplexityMeter'
import { DiagnosticsPanel } from '@/components/DiagnosticsPanel'
import { ExportPanel } from '@/components/ExportPanel'
import { FeedbackButton } from '@/components/FeedbackButton'
import { ForkDialog } from '@/components/ForkDialog'
import { GeneratorPanel } from '@/components/GeneratorPanel'
import { HistoryControls } from '@/components/HistoryControls'
import { HomeView } from '@/components/home/HomeView'
import { PanelInspector } from '@/components/PanelInspector'
import { PhotoImport } from '@/components/PhotoImport'
import { ProjectsPanel } from '@/components/ProjectsPanel'
import { PromoPanel } from '@/components/promo/PromoPanel'
import { ResetButton } from '@/components/ResetButton'
import { RowInspector } from '@/components/RowInspector'
import { SaveProjectButton } from '@/components/SaveProjectButton'
import { SpeciesPalette } from '@/components/SpeciesPalette'
import { TemplateGallery } from '@/components/TemplateGallery'
import { HelpHint } from '@/components/ui/help-hint'
import { Separator } from '@/components/ui/separator'
import { t } from '@/lib/i18n'
import { useDerived } from '@/lib/store/derived'
import { useStudioPersistence } from '@/lib/store/persist'
import { useStudio, type StudioView } from '@/lib/store/studio'

const FULL_WIDTH: readonly StudioView[] = ['home', 'templates', 'generate', 'photo', 'projects', 'books', 'promo']

export function StudioShell() {
  const locale = useStudio((s) => s.locale)
  const unit = useStudio((s) => s.unit)
  const view = useStudio((s) => s.view)
  const { model, calc } = useDerived()
  useStudioPersistence()

  return (
    <div className="min-h-screen bg-app">
      <AppHeader
        tabs
        units
        tools={
          <>
            <HistoryControls />
            <Separator orientation="vertical" className="h-6" />
            <ResetButton />
          </>
        }
      />

      <main className="mx-auto flex max-w-[1440px] flex-col gap-6 px-4 py-4">
        {FULL_WIDTH.includes(view) ? (
          view === 'home' ? (
            <HomeView />
          ) : view === 'templates' ? (
            <TemplateGallery />
          ) : view === 'generate' ? (
            <GeneratorPanel />
          ) : view === 'photo' ? (
            <PhotoImport />
          ) : view === 'books' ? (
            <LiteratureSection />
          ) : view === 'promo' ? (
            <PromoPanel />
          ) : (
            <ProjectsPanel />
          )
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,236px)_minmax(0,1fr)_minmax(0,268px)] lg:items-start">
            <div className="flex min-w-0 flex-col gap-4 lg:order-2">
              {view === 'view3d' ? (
                <Board3DPanel />
              ) : (
                <>
                  <section
                    aria-label={t(locale, 'board.title')}
                    className="flex min-w-0 flex-col gap-2 overflow-auto rounded-lg bg-canvas p-[22px]"
                  >
                    <div className="flex items-center gap-1.5 self-start">
                      <span className="text-[13px] font-medium text-ink-secondary">{t(locale, 'board.title')}</span>
                      <HelpHint id="editor" side="bottom" />
                    </div>
                    <div className="flex min-w-0 flex-1 items-center justify-center">
                      <BoardCanvas />
                    </div>
                  </section>
                  <PanelInspector />
                  <RowInspector />
                </>
              )}
            </div>

            <div className="flex flex-col gap-4 [&>*]:shrink-0 lg:order-1 lg:sticky lg:top-4 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto">
              <SpeciesPalette />
              <ToolRecommendations />
            </div>

            <aside className="flex flex-col gap-4 [&>*]:shrink-0 lg:order-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto">
              {/* Диагностика первая: RAGGED_BOARD и другие ошибки изготовимости раньше стояли
                  последними в прокручиваемом сайдбаре и терялись из виду (владелец не заметил
                  предупреждение о рваной сетке). Наверху панель видна сразу, без скролла. */}
              <DiagnosticsPanel />
              <BoardSettings />
              <ComplexityMeter locale={locale} calc={calc} unit={unit} model={model} />
              <ExportPanel />
              <SaveProjectButton />
            </aside>
          </div>
        )}

        <ForkDialog />
      </main>

      <FeedbackButton />
    </div>
  )
}

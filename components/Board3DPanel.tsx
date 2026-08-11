'use client'

import dynamic from 'next/dynamic'
import { Component, type ReactNode } from 'react'
import { t } from '@/lib/i18n'
import { useDerived } from '@/lib/store/derived'
import { MAX_INSTANCES } from '@/lib/render3d/instances'
import { useStudio } from '@/lib/store/studio'

export function Board3DSkeleton() {
  const locale = useStudio((s) => s.locale)
  return (
    <div
      data-testid="view3d-loading"
      className="flex h-full w-full items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground"
    >
      {t(locale, 'view3d.loading')}
    </div>
  )
}

// three и R3F весят сотни килобайт: первый экран редактора не должен их тянуть.
const Board3D = dynamic(() => import('@/components/Board3D').then((m) => m.Board3D), {
  ssr: false,
  loading: () => <Board3DSkeleton />,
})

/** Класс, а не хук: границы ошибок в React 19 всё ещё только классовые. */
class WebglBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

export function Board3DPanel() {
  const locale = useStudio((s) => s.locale)
  const { model } = useDerived()
  const shown = Math.min(model.cells.length, MAX_INSTANCES)

  return (
    <section data-testid="view3d" aria-label={t(locale, 'view3d.title')} className="flex flex-col gap-2">
      <div className="h-[26rem] w-full overflow-hidden rounded-lg border sm:h-[32rem]">
        <WebglBoundary
          fallback={
            <div
              data-testid="view3d-unsupported"
              className="flex h-full w-full items-center justify-center p-6 text-center text-sm text-muted-foreground"
            >
              {t(locale, 'view3d.unsupported')}
            </div>
          }
        >
          <Board3D model={model} label={t(locale, 'aria.board3d')} />
        </WebglBoundary>
      </div>
      <p className="text-xs text-muted-foreground">{t(locale, 'view3d.hint')}</p>
      {model.truncated ? (
        <p className="text-xs text-amber-700">
          {t(locale, 'view3d.truncated', { shown, total: model.cells.length })}
        </p>
      ) : null}
    </section>
  )
}

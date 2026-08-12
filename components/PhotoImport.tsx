'use client'

import { useMemo, useRef, useState } from 'react'
import { ImagePlus } from 'lucide-react'
import { BoardSvg } from '@/components/BoardSvg'
import { ConfirmReplace } from '@/components/ConfirmReplace'
import { Button } from '@/components/ui/button'
import { HelpHint } from '@/components/ui/help-hint'
import { compile } from '@/lib/engine'
import { t } from '@/lib/i18n'
import { PHOTO_MAX_COLORS, PHOTO_MIN_COLORS, photoToDesign } from '@/lib/photo'
import { seedFromString } from '@/lib/generators'
import { selectIsDirty, useStudio } from '@/lib/store/studio'
import { cn, rangeFillVar, RANGE_INPUT_CLASS } from '@/lib/utils'
import { ACCEPTED_TYPES, decodeToGrid, isImageFile } from './photoDecode'

type Status = 'idle' | 'loading' | 'badType' | 'failed'

export function PhotoImport() {
  const locale = useStudio((s) => s.locale)
  const photo = useStudio((s) => s.photo)
  const setPhoto = useStudio((s) => s.setPhoto)
  const loadDesign = useStudio((s) => s.loadDesign)
  const setView = useStudio((s) => s.setView)
  const dirty = useStudio(selectIsDirty)
  const [status, setStatus] = useState<Status>('idle')
  const [confirming, setConfirming] = useState(false)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const result = useMemo(() => {
    if (!photo) return null
    const built = photoToDesign(photo.grid, {
      colors: photo.colors,
      panels: photo.panels,
      name: t(locale, 'photo.designName', { file: photo.fileName }),
      seed: seedFromString(photo.fileName),
    })
    return { ...built, model: compile(built.design) }
  }, [photo, locale])

  const accept = (file: File | undefined): void => {
    if (!file) return
    if (!isImageFile(file)) {
      setStatus('badType')
      return
    }
    setStatus('loading')
    // Асинхронный обработчик события, а не эффект: правило set-state-in-effect не нарушается.
    decodeToGrid(file)
      .then((grid) => {
        setPhoto({ grid, fileName: file.name, colors: 3, panels: Math.max(2, Math.min(6, grid.rows)) })
        setStatus('idle')
      })
      .catch(() => setStatus('failed'))
  }

  const apply = (): void => {
    if (!result) return
    loadDesign(result.design)
    setConfirming(false)
    setView('editor')
  }

  const maxPanels = photo ? Math.max(1, photo.grid.rows) : 1

  return (
    <section data-testid="photo-panel" aria-label={t(locale, 'aria.photoPanel')} className="flex flex-col gap-4">
      <div>
        <div className="flex items-center gap-1.5">
          <h2 className="font-display text-2xl font-semibold">{t(locale, 'photo.title')}</h2>
          <HelpHint id="photo" side="bottom" />
        </div>
        <p className="text-base text-ink-secondary">{t(locale, 'photo.subtitle')}</p>
      </div>

      <div
        data-testid="photo-dropzone"
        onDragOver={(event) => event.preventDefault()}
        onDragEnter={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          accept(event.dataTransfer?.files?.[0])
        }}
        className={cn(
          'flex flex-col items-center gap-2 rounded-lg border-[1.5px] border-dashed border-line-strong bg-surface-sunken p-[26px] text-center',
          dragging && 'border-accent bg-accent-soft',
        )}
      >
        <ImagePlus size={26} className="text-ink-muted" strokeWidth={1.6} />
        <p className="text-sm font-semibold">{t(locale, 'photo.drop')}</p>
        <p className="text-xs text-ink-muted">{t(locale, 'photo.dropHint')}</p>
        <input
          ref={inputRef}
          data-testid="photo-file"
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          className="sr-only"
          onChange={(event) => accept(event.target.files?.[0])}
        />
        <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
          {t(locale, 'photo.pick')}
        </Button>
        {status === 'loading' ? <p className="text-xs text-ink-muted">{t(locale, 'photo.loading')}</p> : null}
        {status === 'badType' || status === 'failed' ? (
          <p
            data-testid="photo-error"
            role="alert"
            className="rounded-md border border-error-border bg-error-soft px-3 py-[11px] text-[13px] font-semibold text-error-text"
          >
            {t(locale, status === 'badType' ? 'photo.errorType' : 'photo.error')}
          </p>
        ) : null}
      </div>

      {photo && result ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex w-40 flex-col gap-1">
              <span className="flex items-center justify-between text-[13px] text-ink-secondary">
                <span>{t(locale, 'photo.colors')}</span>
                <span className="font-mono text-xs tabular-nums">{photo.colors}</span>
              </span>
              <input
                data-testid="photo-colors"
                type="range"
                min={PHOTO_MIN_COLORS}
                max={PHOTO_MAX_COLORS}
                step={1}
                value={photo.colors}
                onChange={(event) => setPhoto({ ...photo, colors: Number(event.target.value) })}
                style={rangeFillVar(photo.colors, PHOTO_MIN_COLORS, PHOTO_MAX_COLORS)}
                className={RANGE_INPUT_CLASS}
              />
            </label>
            <label className="flex w-40 flex-col gap-1">
              <span className="flex items-center justify-between text-[13px] text-ink-secondary">
                <span>{t(locale, 'photo.panels')}</span>
                <span className="font-mono text-xs tabular-nums">{photo.panels}</span>
              </span>
              <input
                data-testid="photo-panels"
                type="range"
                min={1}
                max={maxPanels}
                step={1}
                value={photo.panels}
                onChange={(event) => setPhoto({ ...photo, panels: Number(event.target.value) })}
                style={rangeFillVar(photo.panels, 1, maxPanels)}
                className={RANGE_INPUT_CLASS}
              />
              <span className="text-xs text-ink-muted">{t(locale, 'photo.panelsHint')}</span>
            </label>
            <Button data-testid="photo-apply" size="sm" onClick={() => (dirty ? setConfirming(true) : apply())}>
              {t(locale, 'photo.apply')}
            </Button>
          </div>

          <div data-testid="photo-preview" aria-label={t(locale, 'aria.photoPreview')}>
            <BoardSvg model={result.model} locale={locale} maxPx={420} />
          </div>
          <span data-testid="photo-stats" className="font-mono text-sm text-ink-muted tabular-nums">
            {t(locale, 'photo.stats', {
              glueUps: result.model.glueUpCount,
              species: result.species.length,
              widthMm: Math.round(result.model.widthMm),
              lengthMm: Math.round(result.model.lengthMm),
            })}
          </span>
        </div>
      ) : null}

      {confirming ? (
        <ConfirmReplace
          testId="photo"
          title={t(locale, 'photo.confirmTitle')}
          body={t(locale, 'photo.confirmBody')}
          confirmLabel={t(locale, 'photo.confirmApply')}
          cancelLabel={t(locale, 'photo.confirmCancel')}
          onConfirm={apply}
          onCancel={() => setConfirming(false)}
        />
      ) : null}
    </section>
  )
}

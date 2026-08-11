'use client'

import { useMemo, useRef, useState } from 'react'
import { BoardSvg } from '@/components/BoardSvg'
import { ConfirmReplace } from '@/components/ConfirmReplace'
import { Button } from '@/components/ui/button'
import { compile } from '@/lib/engine'
import { t } from '@/lib/i18n'
import { PHOTO_MAX_COLORS, PHOTO_MIN_COLORS, photoToDesign } from '@/lib/photo'
import { seedFromString } from '@/lib/generators'
import { selectIsDirty, useStudio } from '@/lib/store/studio'
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
        <h2 className="text-lg font-semibold">{t(locale, 'photo.title')}</h2>
        <p className="text-sm text-muted-foreground">{t(locale, 'photo.subtitle')}</p>
      </div>

      <div
        data-testid="photo-dropzone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          accept(event.dataTransfer?.files?.[0])
        }}
        className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center"
      >
        <p className="text-sm text-muted-foreground">{t(locale, 'photo.drop')}</p>
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
        {status === 'loading' ? <p className="text-sm">{t(locale, 'photo.loading')}</p> : null}
        {status === 'badType' || status === 'failed' ? (
          <p data-testid="photo-error" role="alert" className="text-sm text-destructive">
            {t(locale, status === 'badType' ? 'photo.errorType' : 'photo.error')}
          </p>
        ) : null}
      </div>

      {photo && result ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 text-sm">
              {t(locale, 'photo.colors')}
              <input
                data-testid="photo-colors"
                type="range"
                min={PHOTO_MIN_COLORS}
                max={PHOTO_MAX_COLORS}
                step={1}
                value={photo.colors}
                onChange={(event) => setPhoto({ ...photo, colors: Number(event.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t(locale, 'photo.panels')}
              <input
                data-testid="photo-panels"
                type="range"
                min={1}
                max={maxPanels}
                step={1}
                value={photo.panels}
                onChange={(event) => setPhoto({ ...photo, panels: Number(event.target.value) })}
              />
              <span className="text-xs text-muted-foreground">{t(locale, 'photo.panelsHint')}</span>
            </label>
            <Button data-testid="photo-apply" size="sm" onClick={() => (dirty ? setConfirming(true) : apply())}>
              {t(locale, 'photo.apply')}
            </Button>
          </div>

          <div data-testid="photo-preview" aria-label={t(locale, 'aria.photoPreview')}>
            <BoardSvg model={result.model} locale={locale} maxPx={420} />
          </div>
          <span data-testid="photo-stats" className="text-sm text-muted-foreground">
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

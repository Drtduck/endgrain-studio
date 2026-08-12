'use client'

import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { generatePromoShotsAction } from '@/app/actions/promo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { HelpHint } from '@/components/ui/help-hint'
import { PromoMockShot } from '@/components/promo/PromoMockShot'
import { renderBoardSvg, safeFileName } from '@/lib/export'
import { t } from '@/lib/i18n'
import { describeBoard } from '@/lib/promo/describe'
import { MAX_PNG_CHARS } from '@/lib/promo/schema'
import { PROMO_SHOT_META, type PromoResult, type PromoShotKind } from '@/lib/promo/types'
import { useDerived } from '@/lib/store/derived'
import { selectDesign, useStudio } from '@/lib/store/studio'

/** Сторона рендера доски, который уходит в промпт. Больше 1024 Gemini всё равно ужмёт сам. */
const REFERENCE_PX = 1024

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('FileReader failed'))
    reader.readAsDataURL(blob)
  })
}

export function PhotoSeries() {
  const locale = useStudio((s) => s.locale)
  const design = useStudio(selectDesign)
  const { model } = useDerived()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<PromoResult | null>(null)

  const imageByKind = new Map<PromoShotKind, string>(
    result !== null && result.ok && !result.mock ? result.images.map((image) => [image.kind, image.dataUrl]) : [],
  )
  // Три разных состояния, и путать их нельзя: пока не нажимали, врать про недостающий
  // ключ нечестно, а после настоящей генерации незачем показывать текст про заглушки.
  const note: 'idle' | 'needKey' | 'ready' =
    result === null || !result.ok ? 'idle' : result.mock ? 'needKey' : 'ready'

  const run = async (): Promise<void> => {
    setBusy(true)
    setResult(null)
    try {
      // Растеризация только по клику: канвас-конвертер незачем тащить в первый бандл страницы.
      const { svgToPngBlob } = await import('@/lib/export/png')
      const rendered = renderBoardSvg(model, { maxPx: REFERENCE_PX })
      const boardPng = await blobToDataUrl(await svgToPngBlob(rendered, { scale: 1 }))
      // Тело серверного действия ограничено, и упереться в него лучше здесь, внятной
      // строкой про слишком дробный узор, чем исключением из недр Next на проде.
      if (boardPng.length > MAX_PNG_CHARS) {
        setResult({ ok: false, error: 'tooLarge' })
        return
      }
      setResult(await generatePromoShotsAction({ boardPng, description: describeBoard(design, model).text }))
    } catch (err) {
      // Причина уходит в консоль браузера, пользователю показываем одну человеческую строку.
      console.error(err)
      setResult({ ok: false, error: 'failed' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      data-testid="promo-photo"
      aria-label={t(locale, 'promo.title')}
      className="flex flex-col gap-4 rounded-lg border border-line-subtle bg-surface p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-[17px] font-semibold">{t(locale, 'promo.title')}</h2>
        <HelpHint id="promo" side="bottom" />
        <div className="flex-1" />
        <Button size="sm" data-testid="promo-generate" disabled={busy} onClick={() => { void run() }}>
          <Sparkles data-icon="inline-start" />
          {busy ? t(locale, 'promo.busy') : t(locale, 'promo.generate')}
        </Button>
      </div>

      <p className="max-w-[68ch] text-[13px] text-ink-secondary">{t(locale, 'promo.subtitle')}</p>

      {result !== null && !result.ok ? (
        <p
          data-testid="promo-error"
          role="alert"
          className="rounded-md border border-error-border bg-error-soft px-3 py-[11px] text-[13px] font-semibold text-error-text"
        >
          {t(locale, `promo.err.${result.error}`)}
        </p>
      ) : null}

      <ul data-testid="promo-gallery" className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
        {PROMO_SHOT_META.map((shot) => {
          const dataUrl = imageByKind.get(shot.kind)
          return (
            <li
              key={shot.kind}
              data-testid={`promo-shot-${shot.kind}`}
              className="flex flex-col gap-2 overflow-hidden rounded-lg border border-line-subtle bg-surface-raised shadow-sm"
            >
              <div className="relative bg-canvas">
                {dataUrl === undefined ? (
                  <PromoMockShot kind={shot.kind} model={model} />
                ) : (
                  <img src={dataUrl} alt={t(locale, shot.titleKey)} className="block h-auto w-full" />
                )}
                {dataUrl === undefined ? (
                  <Badge className="absolute top-2 right-2 bg-surface/90">{t(locale, 'promo.mockBadge')}</Badge>
                ) : null}
              </div>
              <div className="flex flex-col gap-1 px-3 pb-3">
                <span className="text-sm font-semibold">{t(locale, shot.titleKey)}</span>
                <span className="text-[13px] text-ink-secondary">{t(locale, shot.noteKey)}</span>
                {dataUrl === undefined ? (
                  <span className="mt-1 text-xs text-ink-muted">{t(locale, 'promo.mockNote')}</span>
                ) : (
                  <a
                    href={dataUrl}
                    download={safeFileName(`${design.name}-${shot.kind}`, 'png')}
                    className="mt-1 w-fit text-xs font-semibold text-accent underline-offset-4 hover:underline"
                  >
                    {t(locale, 'promo.download')}
                  </a>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <p data-testid="promo-note" className="text-xs text-ink-muted">
        {t(locale, note === 'idle' ? 'promo.idle' : note === 'needKey' ? 'promo.needKey' : 'promo.ready')}
      </p>
    </section>
  )
}

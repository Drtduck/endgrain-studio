'use client'

import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Sparkles, Wand2, X } from 'lucide-react'
import { analyzeReferenceAction, listActiveSeriesAction, listPromoSeriesAction } from '@/app/actions/promo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { AiGateNote, useAiGate } from '@/components/promo/AiGate'
import { PromoMockShot } from '@/components/promo/PromoMockShot'
import { TrialPaywall } from '@/components/promo/TrialPaywall'
import { blobToDataUrl, boardPngDataUrl } from '@/components/promo/boardPng'
import { useSession } from '@/components/SessionProvider'
import { FREE_TRIAL_MAX_UNITS, aiCost } from '@/lib/ai/quota'
import { safeFileName } from '@/lib/export'
import { t, type MessageKey } from '@/lib/i18n'
import { useProjectGuard } from '@/lib/projects/useProjectGuard'
import { STYLE_FIELDS, type StyleAnalysis } from '@/lib/promo/reference'
import {
  MAX_PNG_CHARS,
  REFERENCE_ACCEPT,
  REFERENCE_DATA_URL_RE,
  REFERENCE_MAX_BYTES,
  REFERENCE_MAX_COUNT,
  REFERENCE_MIME,
} from '@/lib/promo/schema'
import { PROMO_SHOT_LAYOUT, type PromoShotKind, type PromoShotStatus } from '@/lib/promo/types'
import { useSeriesRunner } from '@/lib/promo/useSeriesRunner'
import { useDerived } from '@/lib/store/derived'
import { selectDesign, useStudio } from '@/lib/store/studio'

/** Подпись поля разбора. Ключи собраны статически, чтобы MessageKey проверял их тип. */
const FIELD_LABEL: Readonly<Record<(typeof STYLE_FIELDS)[number], MessageKey>> = {
  lighting: 'ref.field.lighting',
  angle: 'ref.field.angle',
  background: 'ref.field.background',
  palette: 'ref.field.palette',
  composition: 'ref.field.composition',
  mood: 'ref.field.mood',
  lens: 'ref.field.lens',
  postProcessing: 'ref.field.postProcessing',
}

const STATUS_KEY: Readonly<Record<PromoShotStatus, MessageKey>> = {
  queued: 'promo.status.queued',
  running: 'promo.status.running',
  done: 'promo.status.done',
  failed: 'promo.status.failed',
  blocked: 'promo.status.blocked',
  cancelled: 'promo.status.cancelled',
}

/**
 * Генерация по референсу. Человек приносит понравившийся кадр, модель со зрением
 * раскладывает его на приёмы съёмки, разбор показывается на экране и правится
 * руками, и только потом рисуются кадры с нашей доской через тот же job-путь
 * (lib/promo/useSeriesRunner), что и PhotoSeries - без Promise.all, с сохранением
 * в Storage и честным прогрессом.
 */
export function ReferenceShots() {
  const locale = useStudio((s) => s.locale)
  const design = useStudio(selectDesign)
  const { model } = useDerived()
  const guard = useProjectGuard()
  const { user } = useSession()
  const fileInput = useRef<HTMLInputElement>(null)

  const [preview, setPreview] = useState<string | null>(null)
  const [style, setStyle] = useState<StyleAnalysis | null>(null)
  const [busy, setBusy] = useState<'analyze' | 'generate' | null>(null)
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null)
  const [remaining, setRemaining] = useState<number | null>(null)
  const gate = useAiGate(remaining, 'referenceShots')
  const trialMode = gate.access.state === 'trial'
  const demoMode = gate.access.state === 'mock'
  const [count, setCount] = useState(() => (trialMode ? FREE_TRIAL_MAX_UNITS : 2))
  // Кадры готовы, но человек не проходил разбор референса заново (F5, другой
  // визит): галерея показывает их и без style (спека раздела с разбором сама
  // не персистится - персистятся кадры, ради которых всё затевалось).
  const [hydrated, setHydrated] = useState(false)
  const runner = useSeriesRunner()
  const projectId = guard.state.kind === 'ready' ? guard.state.projectId : null

  // Кадры переживают перезагрузку страницы (P0-6, ревью 14.08.2026): та же
  // логика, что в PhotoSeries.tsx - сначала брошенная (queued/running) серия
  // где угодно у пользователя, иначе последняя серия ЭТОГО проекта с
  // source='reference', даже уже завершённая.
  const hydratedRef = useRef(false)
  useEffect(() => {
    if (demoMode || !user || hydratedRef.current) return
    let cancelled = false

    function applyHydration(hydratedSeries: Parameters<typeof runner.hydrate>[0], shots: Parameters<typeof runner.hydrate>[1]): void {
      hydratedRef.current = true
      const ownCount = shots.filter((s) => s.seriesId === hydratedSeries.id && s.parentShotId === null).length
      if (ownCount > 0) setCount(Math.min(REFERENCE_MAX_COUNT, ownCount))
      setHydrated(true)
      runner.hydrate(hydratedSeries, shots)
    }

    void (async () => {
      const active = await listActiveSeriesAction()
      if (cancelled) return
      if (active.ok) {
        const activeSeries = active.data.series.find((s) => s.source === 'reference')
        if (activeSeries !== undefined) {
          applyHydration(activeSeries, active.data.shots)
          return
        }
      }
      if (projectId === null) return
      const mine = await listPromoSeriesAction(projectId)
      if (cancelled || !mine.ok) return
      const latest = mine.data.series.find((s) => s.source === 'reference')
      if (latest === undefined) return
      applyHydration(latest, mine.data.shots)
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoMode, user, projectId, runner.hydrate])

  const cost = aiCost('referenceShots', count)
  const kinds: readonly PromoShotKind[] = ['hero', 'serving', 'macroOil', 'package'].slice(0, count) as PromoShotKind[]

  const pick = async (file: File | undefined): Promise<void> => {
    if (file === undefined) return
    setErrorKey(null)
    runner.reset()
    setStyle(null)
    if (!REFERENCE_MIME.includes(file.type)) {
      setPreview(null)
      setErrorKey('ref.err.type')
      return
    }
    if (file.size > REFERENCE_MAX_BYTES) {
      setPreview(null)
      setErrorKey('ref.err.tooLarge')
      return
    }
    const dataUrl = await blobToDataUrl(file)
    if (!REFERENCE_DATA_URL_RE.test(dataUrl)) {
      setPreview(null)
      setErrorKey('ref.err.type')
      return
    }
    setPreview(dataUrl)
  }

  const analyze = async (): Promise<void> => {
    if (preview === null) return
    setBusy('analyze')
    setErrorKey(null)
    try {
      const res = await analyzeReferenceAction({ referenceImage: preview })
      if (!res.ok) {
        setErrorKey(`promo.err.${res.error}` as MessageKey)
        return
      }
      setStyle(res.style)
      if (!res.mock) setRemaining(res.remaining)
    } catch (err) {
      console.error(err)
      setErrorKey('promo.err.failed')
    } finally {
      setBusy(null)
    }
  }

  const generate = async (): Promise<void> => {
    if (style === null) return
    setBusy('generate')
    setErrorKey(null)
    try {
      if (demoMode) {
        runner.startDemo(kinds.map((kind) => ({ kindSlug: kind })), 'reference')
        return
      }
      const projectId = await guard.ensureSaved()
      if (projectId === null) return
      const boardPng = await boardPngDataUrl(model)
      if (boardPng.length > MAX_PNG_CHARS) {
        setErrorKey('promo.err.tooLarge')
        return
      }
      await runner.start({
        source: 'reference',
        projectId,
        walletRef: crypto.randomUUID(),
        boardPng,
        style,
        count,
      })
    } catch (err) {
      console.error(err)
      setErrorKey('promo.err.failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section
      data-testid="promo-reference"
      aria-label={t(locale, 'ref.title')}
      className="flex flex-col gap-4 rounded-lg border border-line-subtle bg-surface p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-[17px] font-semibold">{t(locale, 'ref.title')}</h2>
        <div className="flex-1" />
        <Button
          size="sm"
          variant="outline"
          data-testid="ref-pick"
          disabled={busy !== null}
          onClick={() => fileInput.current?.click()}
        >
          <ImagePlus data-icon="inline-start" />
          {t(locale, 'ref.pick')}
        </Button>
        <Button
          size="sm"
          data-testid="ref-analyze"
          disabled={busy !== null || preview === null || gate.locked}
          onClick={() => { void analyze() }}
        >
          <Wand2 data-icon="inline-start" />
          {busy === 'analyze' ? t(locale, 'ref.analyzing') : t(locale, 'ref.analyze')}
        </Button>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept={REFERENCE_ACCEPT}
        data-testid="ref-file"
        className="sr-only"
        onChange={(e) => {
          void pick(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      <p className="max-w-[68ch] text-[13px] text-ink-secondary">{t(locale, 'ref.subtitle')}</p>

      <p data-testid="ref-disclaimer" className="max-w-[68ch] rounded-md border border-line-subtle bg-surface-raised px-3 py-[11px] text-[13px] text-ink-secondary">
        {t(locale, 'ref.disclaimer')}
      </p>

      {gate.showPaywall ? <TrialPaywall locale={locale} /> : <AiGateNote gate={gate} locale={locale} testId="ref-gate" />}

      {errorKey !== null ? (
        <p
          data-testid="ref-error"
          role="alert"
          className="rounded-md border border-error-border bg-error-soft px-3 py-[11px] text-[13px] font-semibold text-error-text"
        >
          {t(locale, errorKey, { remaining: gate.access.remaining })}
        </p>
      ) : null}

      {preview !== null ? (
        <div className="flex flex-wrap items-start gap-4">
          <div className="relative w-40 shrink-0 overflow-hidden rounded-lg border border-line-subtle bg-canvas">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt={t(locale, 'ref.previewAlt')} data-testid="ref-preview" className="block h-auto w-full" />
            <Badge className="absolute top-2 right-2 bg-surface/90">{t(locale, 'ref.badge')}</Badge>
          </div>
          <p className="max-w-[48ch] text-[13px] text-ink-secondary">{t(locale, 'ref.picked')}</p>
        </div>
      ) : null}

      {style !== null ? (
        <div className="flex flex-col gap-3" data-testid="ref-style">
          <h3 className="text-sm font-semibold">{t(locale, 'ref.styleTitle')}</h3>
          <p className="max-w-[68ch] text-[13px] text-ink-secondary">{t(locale, 'ref.styleHint')}</p>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
            {STYLE_FIELDS.map((field) => (
              <label key={field} className="flex flex-col gap-1 text-[13px]">
                <span className="font-semibold">{t(locale, FIELD_LABEL[field])}</span>
                <Textarea
                  rows={3}
                  data-testid={`ref-style-${field}`}
                  value={style[field]}
                  onChange={(e) => { setStyle({ ...style, [field]: e.target.value }) }}
                />
              </label>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[13px] font-semibold">{t(locale, 'ref.count')}</span>
            <div className="flex gap-1.5">
              {Array.from({ length: REFERENCE_MAX_COUNT }, (_, i) => i + 1).map((n) => {
                const disabled = trialMode && n !== 1
                return (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={n === count}
                    disabled={disabled}
                    title={disabled ? t(locale, 'ai.trial.oneShot') : undefined}
                    data-testid={`ref-count-${n}`}
                    onClick={() => { setCount(n) }}
                    className={
                      n === count
                        ? 'w-9 rounded-md border border-accent bg-accent/10 py-1.5 text-[13px] font-semibold text-accent'
                        : 'w-9 rounded-md border border-line-subtle bg-surface-raised py-1.5 text-[13px] text-ink-secondary hover:border-line disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-line-subtle'
                    }
                  >
                    {n}
                  </button>
                )
              })}
            </div>
            <span data-testid="ref-cost" className="text-[13px] text-ink-secondary">
              {t(locale, 'ref.cost', { count, cost })}
            </span>
            <div className="flex-1" />
            <Button
              size="sm"
              data-testid="ref-generate"
              disabled={busy !== null || gate.locked}
              onClick={() => { void generate() }}
            >
              <Sparkles data-icon="inline-start" />
              {busy === 'generate' ? t(locale, 'promo.busy') : t(locale, 'ref.generate')}
            </Button>
          </div>
        </div>
      ) : null}

      {runner.error !== null ? (
        <p
          data-testid="promo-error"
          role="alert"
          className="rounded-md border border-error-border bg-error-soft px-3 py-[11px] text-[13px] font-semibold text-error-text"
        >
          {t(locale, `promo.err.${runner.error}` as MessageKey, { remaining: gate.access.remaining })}
        </p>
      ) : null}

      {runner.series !== null ? (
        <div className="flex flex-wrap items-center gap-3">
          <p data-testid="promo-series-progress" className="text-[13px] font-semibold">
            {t(locale, 'promo.progress', { done: runner.series.succeeded, total: runner.series.requested })}
            {runner.series.failed > 0 ? ` ${t(locale, 'promo.progress.failed', { failed: runner.series.failed })}` : ''}
          </p>
          {runner.series.status === 'queued' || runner.series.status === 'running' ? (
            <Button size="sm" variant="outline" data-testid="promo-cancel" onClick={() => { runner.cancel() }}>
              <X data-icon="inline-start" />
              {t(locale, 'promo.cancel')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {style !== null || hydrated ? (
        <ul data-testid="ref-gallery" className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
          {runner.shots.map((shot, index) => {
            const layout = PROMO_SHOT_LAYOUT.get(kinds[index] ?? 'hero') ?? 'solo'
            const showMock = shot.url === null
            return (
              <li
                key={shot.id}
                data-testid={`ref-shot-${index + 1}`}
                className="flex flex-col gap-2 overflow-hidden rounded-lg border border-line-subtle bg-surface-raised shadow-sm"
              >
                <div className="relative bg-canvas">
                  {showMock ? (
                    <PromoMockShot layout={layout} model={model} />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={shot.url ?? ''} alt={t(locale, 'ref.shotAlt', { n: index + 1 })} className="block h-auto w-full" />
                  )}
                  <Badge className="absolute top-2 right-2 bg-surface/90">{t(locale, STATUS_KEY[shot.status])}</Badge>
                </div>
                <div className="flex flex-col gap-1 px-3 pb-3">
                  <span className="text-sm font-semibold">{t(locale, 'ref.shotAlt', { n: index + 1 })}</span>
                  {shot.status === 'failed' && shot.retries < 3 ? (
                    <Button size="sm" variant="outline" data-testid={`promo-shot-retry-${shot.id}`} onClick={() => { void runner.retry(shot.id) }}>
                      {t(locale, 'promo.retry')}
                    </Button>
                  ) : null}
                  {shot.status === 'done' && shot.url ? (
                    <a
                      href={shot.url}
                      download={safeFileName(`${design.name}-ref-${index + 1}`, 'png')}
                      className="mt-1 w-fit text-xs font-semibold text-accent underline-offset-4 hover:underline"
                    >
                      {t(locale, 'promo.download')}
                    </a>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}

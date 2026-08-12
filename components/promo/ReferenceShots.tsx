'use client'

import { useRef, useState } from 'react'
import { ImagePlus, Sparkles, Wand2 } from 'lucide-react'
import { analyzeReferenceAction, generateReferenceShotsAction } from '@/app/actions/promo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { AiGateNote, useAiGate } from '@/components/promo/AiGate'
import { PromoMockShot } from '@/components/promo/PromoMockShot'
import { blobToDataUrl, boardPngDataUrl } from '@/components/promo/boardPng'
import { aiCost } from '@/lib/ai/quota'
import { safeFileName } from '@/lib/export'
import { t, type MessageKey } from '@/lib/i18n'
import { describeBoard } from '@/lib/promo/describe'
import { STYLE_FIELDS, type StyleAnalysis } from '@/lib/promo/reference'
import {
  MAX_PNG_CHARS,
  REFERENCE_ACCEPT,
  REFERENCE_DATA_URL_RE,
  REFERENCE_MAX_BYTES,
  REFERENCE_MAX_COUNT,
  REFERENCE_MIME,
} from '@/lib/promo/schema'
import { PROMO_DEFAULT_SHOTS, PROMO_SHOT_LAYOUT, type PromoResult, type PromoShotKind } from '@/lib/promo/types'
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

/**
 * Генерация по референсу. Человек приносит понравившийся кадр, модель со зрением
 * раскладывает его на приёмы съёмки, разбор показывается на экране и правится
 * руками, и только потом рисуются кадры с нашей доской.
 *
 * Показ разбора до генерации это не украшение: кадры платные, и человек должен
 * видеть, что модель поняла, прежде чем отдавать за это квоту. Заодно снимается
 * вопрос «а вы там мою картинку не копируете»: в промпт уезжает ровно тот текст,
 * который виден на экране.
 */
export function ReferenceShots() {
  const locale = useStudio((s) => s.locale)
  const design = useStudio(selectDesign)
  const { model } = useDerived()
  const fileInput = useRef<HTMLInputElement>(null)

  const [preview, setPreview] = useState<string | null>(null)
  const [style, setStyle] = useState<StyleAnalysis | null>(null)
  const [count, setCount] = useState(2)
  const [busy, setBusy] = useState<'analyze' | 'generate' | null>(null)
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null)
  const [result, setResult] = useState<PromoResult | null>(null)
  const [remaining, setRemaining] = useState<number | null>(null)
  const gate = useAiGate(remaining)

  const cost = aiCost('referenceShots', count)
  const images = result !== null && result.ok && !result.mock ? result.images : []
  const kinds: readonly PromoShotKind[] = PROMO_DEFAULT_SHOTS.slice(0, count)

  const pick = async (file: File | undefined): Promise<void> => {
    if (file === undefined) return
    setErrorKey(null)
    setResult(null)
    setStyle(null)
    // Тип и размер проверяются и здесь, и в zod-схеме на сервере. Здесь ради
    // внятного текста без похода в сеть, там ради того, что клиенту веры нет.
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
    // Магия файла: расширение и поле type подделываются в два клика.
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
        setErrorKey(`promo.err.${res.error}`)
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
    setResult(null)
    try {
      const boardPng = await boardPngDataUrl(model)
      if (boardPng.length > MAX_PNG_CHARS) {
        setErrorKey('promo.err.tooLarge')
        return
      }
      const res = await generateReferenceShotsAction({
        boardPng,
        description: describeBoard(design, model).text,
        style,
        count,
      })
      setResult(res)
      if (!res.ok) setErrorKey(`promo.err.${res.error}`)
      if (res.ok && !res.mock && res.remaining !== undefined) setRemaining(res.remaining)
      if (!res.ok && res.error === 'quota') setRemaining(0)
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
          // Сброс значения: иначе повторный выбор того же файла не даст события.
          e.target.value = ''
        }}
      />

      <p className="max-w-[68ch] text-[13px] text-ink-secondary">{t(locale, 'ref.subtitle')}</p>

      {/* Оговорка висит рядом с загрузкой, а не в подвале: человек должен прочитать
          её до того, как принесёт чужой кадр, а не после. */}
      <p data-testid="ref-disclaimer" className="max-w-[68ch] rounded-md border border-line-subtle bg-surface-raised px-3 py-[11px] text-[13px] text-ink-secondary">
        {t(locale, 'ref.disclaimer')}
      </p>

      <AiGateNote gate={gate} locale={locale} testId="ref-gate" />

      {errorKey !== null ? (
        <p
          data-testid="ref-error"
          role="alert"
          className="rounded-md border border-error-border bg-error-soft px-3 py-[11px] text-[13px] font-semibold text-error-text"
        >
          {t(locale, errorKey)}
        </p>
      ) : null}

      {preview !== null ? (
        <div className="flex flex-wrap items-start gap-4">
          <div className="relative w-40 shrink-0 overflow-hidden rounded-lg border border-line-subtle bg-canvas">
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
              {Array.from({ length: REFERENCE_MAX_COUNT }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={n === count}
                  data-testid={`ref-count-${n}`}
                  onClick={() => { setCount(n) }}
                  className={
                    n === count
                      ? 'w-9 rounded-md border border-accent bg-accent/10 py-1.5 text-[13px] font-semibold text-accent'
                      : 'w-9 rounded-md border border-line-subtle bg-surface-raised py-1.5 text-[13px] text-ink-secondary hover:border-line'
                  }
                >
                  {n}
                </button>
              ))}
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

      {style !== null ? (
        <ul data-testid="ref-gallery" className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
          {kinds.map((kind, index) => {
            const dataUrl = images[index]?.dataUrl
            return (
              <li
                key={kind}
                data-testid={`ref-shot-${index + 1}`}
                className="flex flex-col gap-2 overflow-hidden rounded-lg border border-line-subtle bg-surface-raised shadow-sm"
              >
                <div className="relative bg-canvas">
                  {dataUrl === undefined ? (
                    <PromoMockShot layout={PROMO_SHOT_LAYOUT.get(kind) ?? 'solo'} model={model} />
                  ) : (
                    <img src={dataUrl} alt={t(locale, 'ref.shotAlt', { n: index + 1 })} className="block h-auto w-full" />
                  )}
                  {dataUrl === undefined ? (
                    <Badge className="absolute top-2 right-2 bg-surface/90">{t(locale, 'promo.mockBadge')}</Badge>
                  ) : null}
                </div>
                <div className="flex flex-col gap-1 px-3 pb-3">
                  <span className="text-sm font-semibold">{t(locale, 'ref.shotAlt', { n: index + 1 })}</span>
                  {dataUrl === undefined ? null : (
                    <a
                      href={dataUrl}
                      download={safeFileName(`${design.name}-ref-${index + 1}`, 'png')}
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
      ) : null}
    </section>
  )
}

'use client'

import { useState } from 'react'
import { Check, Sparkles } from 'lucide-react'
import { generatePromoShotsAction } from '@/app/actions/promo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { HelpHint } from '@/components/ui/help-hint'
import { AiGateNote, useAiGate } from '@/components/promo/AiGate'
import { PromoMockShot } from '@/components/promo/PromoMockShot'
import { TrialPaywall } from '@/components/promo/TrialPaywall'
import { boardPngDataUrl } from '@/components/promo/boardPng'
import { aiCost } from '@/lib/ai/quota'
import { safeFileName } from '@/lib/export'
import { t } from '@/lib/i18n'
import { describeBoard } from '@/lib/promo/describe'
import { MAX_PNG_CHARS } from '@/lib/promo/schema'
import { PROMO_DEFAULT_SHOTS, PROMO_SHOT_META, type PromoResult, type PromoShotKind } from '@/lib/promo/types'
import { useDerived } from '@/lib/store/derived'
import { selectDesign, useStudio } from '@/lib/store/studio'

export function PhotoSeries() {
  const locale = useStudio((s) => s.locale)
  const design = useStudio(selectDesign)
  const { model } = useDerived()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<PromoResult | null>(null)
  // Отмеченные пресеты. Двенадцать кадров разом стоят двенадцать единиц квоты
  // из тридцати, поэтому набор выбирает человек, а не кнопка за него.
  const [selected, setSelected] = useState<readonly PromoShotKind[]>(PROMO_DEFAULT_SHOTS)
  // Остаток квоты после последней генерации: сервер возвращает его в ответе.
  const [remaining, setRemaining] = useState<number | null>(null)
  const gate = useAiGate(remaining)
  // Во free-тире серия режется до одного кадра ещё на сервере: чипы отражают
  // это здесь, а не только после отказа - выбрать второй кадр вместо первого
  // можно, набрать оба сразу нельзя.
  const trialMode = gate.access.state === 'trial'

  const cost = aiCost('promoShots', selected.length)
  const imageByKind = new Map<PromoShotKind, string>(
    result !== null && result.ok && !result.mock ? result.images.map((image) => [image.kind, image.dataUrl]) : [],
  )
  // Три разных состояния, и путать их нельзя: пока не нажимали, врать про недостающий
  // ключ нечестно, а после настоящей генерации незачем показывать текст про заглушки.
  const note: 'idle' | 'needKey' | 'ready' =
    result === null || !result.ok ? 'idle' : result.mock ? 'needKey' : 'ready'

  const toggle = (kind: PromoShotKind): void => {
    setSelected((prev) => {
      if (prev.includes(kind)) return prev.filter((k) => k !== kind)
      // Пробный тир: второй отмеченный кадр заменяет первый, а не добавляется к нему.
      return trialMode ? [kind] : [...prev, kind]
    })
  }

  const run = async (): Promise<void> => {
    setBusy(true)
    setResult(null)
    try {
      const boardPng = await boardPngDataUrl(model)
      // Тело серверного действия ограничено, и упереться в него лучше здесь, внятной
      // строкой про слишком дробный узор, чем исключением из недр Next на проде.
      if (boardPng.length > MAX_PNG_CHARS) {
        setResult({ ok: false, error: 'tooLarge' })
        return
      }
      const res = await generatePromoShotsAction({
        boardPng,
        description: describeBoard(design, model).text,
        kinds: selected,
      })
      setResult(res)
      if (res.ok && !res.mock && res.remaining !== undefined) setRemaining(res.remaining)
      if (!res.ok && res.error === 'quota') setRemaining(0)
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
        <Button
          size="sm"
          data-testid="promo-generate"
          disabled={busy || gate.locked || selected.length === 0}
          onClick={() => { void run() }}
        >
          <Sparkles data-icon="inline-start" />
          {busy ? t(locale, 'promo.busy') : t(locale, 'promo.generate')}
        </Button>
      </div>

      <p className="max-w-[68ch] text-[13px] text-ink-secondary">{t(locale, 'promo.subtitle')}</p>

      <fieldset className="flex flex-col gap-2" data-testid="promo-presets">
        <legend className="mb-1 text-[13px] font-semibold">{t(locale, 'promo.presets')}</legend>
        <div className="flex flex-wrap gap-2">
          {PROMO_SHOT_META.map((shot) => {
            const on = selected.includes(shot.kind)
            // Пробный тир позволяет отметить ровно один кадр: остальные чипы
            // неактивны, пока текущий выбор не снят.
            const disabled = trialMode && !on && selected.length > 0
            return (
              <button
                key={shot.kind}
                type="button"
                data-testid={`promo-preset-${shot.kind}`}
                aria-pressed={on}
                disabled={disabled}
                title={disabled ? t(locale, 'ai.trial.oneShot') : undefined}
                onClick={() => { toggle(shot.kind) }}
                className={
                  on
                    ? 'flex items-center gap-1.5 rounded-full border border-accent bg-accent/10 px-3 py-1.5 text-[13px] font-semibold text-accent'
                    : 'flex items-center gap-1.5 rounded-full border border-line-subtle bg-surface-raised px-3 py-1.5 text-[13px] text-ink-secondary hover:border-line disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-line-subtle'
                }
              >
                {on ? <Check aria-hidden className="size-3.5 shrink-0" /> : null}
                {t(locale, shot.titleKey)}
              </button>
            )
          })}
        </div>
        <p data-testid="promo-cost" className="text-[13px] text-ink-secondary">
          {selected.length === 0
            ? t(locale, 'promo.pickAtLeastOne')
            : t(locale, 'promo.cost', { count: selected.length, cost })}
        </p>
      </fieldset>

      {gate.showPaywall ? (
        <TrialPaywall locale={locale} />
      ) : (
        <AiGateNote gate={gate} locale={locale} testId={trialMode ? 'promo-trial-note' : 'promo-gate'} />
      )}

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
        {PROMO_SHOT_META.filter((shot) => selected.includes(shot.kind) || imageByKind.has(shot.kind)).map((shot) => {
          const dataUrl = imageByKind.get(shot.kind)
          return (
            <li
              key={shot.kind}
              data-testid={`promo-shot-${shot.kind}`}
              className="flex flex-col gap-2 overflow-hidden rounded-lg border border-line-subtle bg-surface-raised shadow-sm"
            >
              <div className="relative bg-canvas">
                {dataUrl === undefined ? (
                  <PromoMockShot layout={shot.mock} model={model} />
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

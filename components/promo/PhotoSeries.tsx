'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Sparkles, X } from 'lucide-react'
import { listActiveSeriesAction, listPromoSeriesAction } from '@/app/actions/promo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { HelpHint } from '@/components/ui/help-hint'
import { Textarea } from '@/components/ui/textarea'
import { AiGateNote, useAiGate } from '@/components/promo/AiGate'
import { PromoMockShot } from '@/components/promo/PromoMockShot'
import { TrialPaywall } from '@/components/promo/TrialPaywall'
import { boardPngDataUrl } from '@/components/promo/boardPng'
import { useSession } from '@/components/SessionProvider'
import { FREE_TRIAL_MAX_UNITS, aiCost } from '@/lib/ai/quota'
import { safeFileName } from '@/lib/export'
import { t, type MessageKey } from '@/lib/i18n'
import { useProjectGuard } from '@/lib/projects/useProjectGuard'
import { composePrompt, SCENES } from '@/lib/promo/prompts'
import { SCENE_MAX_CHARS, checkScene } from '@/lib/promo/promptGuard'
import { MAX_PNG_CHARS } from '@/lib/promo/schema'
import { PROMO_DEFAULT_SHOTS, PROMO_SHOT_META, type PromoSeriesView, type PromoShotKind, type PromoShotStatus, type PromoShotView } from '@/lib/promo/types'
import { useSeriesRunner } from '@/lib/promo/useSeriesRunner'
import { useDerived } from '@/lib/store/derived'
import { selectDesign, useStudio } from '@/lib/store/studio'

const STATUS_TESTID: Readonly<Record<PromoShotStatus, string>> = {
  queued: 'promo-shot-queued',
  running: 'promo-shot-running',
  done: 'promo-shot-done',
  failed: 'promo-shot-failed',
  blocked: 'promo-shot-blocked',
  cancelled: 'promo-shot-cancelled',
}

export function PhotoSeries() {
  const locale = useStudio((s) => s.locale)
  const design = useStudio(selectDesign)
  const { model } = useDerived()
  const { user } = useSession()
  const guard = useProjectGuard()
  const gate = useAiGate(null, 'promoShots')
  const trialMode = gate.access.state === 'trial'
  const demoMode = gate.access.state === 'mock'

  const [selected, setSelected] = useState<readonly PromoShotKind[]>(() =>
    trialMode ? PROMO_DEFAULT_SHOTS.slice(0, FREE_TRIAL_MAX_UNITS) : PROMO_DEFAULT_SHOTS,
  )
  // Правки текста сцены по кадру (спека 6.1): только отмеченные пресеты, ключ - kind.
  const [sceneEdits, setSceneEdits] = useState<Readonly<Record<string, string>>>({})
  const runner = useSeriesRunner()
  const projectId = guard.state.kind === 'ready' ? guard.state.projectId : null

  // Кадры переживают перезагрузку страницы (P0-6, ревью 14.08.2026): при
  // открытии вкладки сначала проверяем, нет ли брошенной (queued/running)
  // серии где угодно у этого пользователя - её обязательно докрутить, где бы
  // она ни висела, - и только если такой нет, показываем последнюю серию
  // ЭТОГО проекта, даже уже завершённую, чтобы честно нарисованные кадры не
  // пропадали с глаз просто потому, что клиентское состояние пустое после F5.
  const hydratedRef = useRef(false)
  useEffect(() => {
    if (demoMode || !user || hydratedRef.current) return
    let cancelled = false

    // Пресеты, которые реально рисовались в этой серии: без этого гейт-набор
    // `selected` остался бы дефолтным, а галерея (она рисует ровно `selected`,
    // не все кадры руки) молчала бы про честно нарисованные, но не входящие
    // в дефолт кадры.
    function applyHydration(hydratedSeries: PromoSeriesView, shots: readonly PromoShotView[]): void {
      hydratedRef.current = true
      const kinds = shots
        .filter((s) => s.seriesId === hydratedSeries.id && s.parentShotId === null)
        .sort((a, b) => a.ordinal - b.ordinal)
        .map((s) => s.kindSlug as PromoShotKind)
      if (kinds.length > 0) setSelected(kinds)
      runner.hydrate(hydratedSeries, shots)
    }

    void (async () => {
      const active = await listActiveSeriesAction()
      if (cancelled) return
      if (active.ok) {
        const activeSeries = active.data.series.find((s) => s.source === 'presets')
        if (activeSeries !== undefined) {
          applyHydration(activeSeries, active.data.shots)
          return
        }
      }
      if (projectId === null) return
      const mine = await listPromoSeriesAction(projectId)
      if (cancelled || !mine.ok) return
      const latest = mine.data.series.find((s) => s.source === 'presets')
      if (latest === undefined) return
      applyHydration(latest, mine.data.shots)
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoMode, user, projectId, runner.hydrate])

  // «Изменить кадр» (спека 6.4): один открытый редактор правки на всю галерею,
  // ключ - id кадра, который сейчас правят (корень или уже готовый вариант).
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [editBusy, setEditBusy] = useState(false)

  const submitEdit = async (shot: PromoShotView): Promise<void> => {
    const verdict = checkScene(editText)
    if (!verdict.ok) return
    setEditBusy(true)
    try {
      const res = await runner.edit(shot, verdict.scene)
      if (res.ok) {
        setEditingId(null)
        setEditText('')
      }
    } finally {
      setEditBusy(false)
    }
  }

  const cost = aiCost('promoShots', selected.length)
  const meta = new Map(PROMO_SHOT_META.map((m) => [m.kind, m]))

  const toggle = (kind: PromoShotKind): void => {
    setSelected((prev) => {
      if (prev.includes(kind)) return prev.filter((k) => k !== kind)
      return trialMode ? [kind] : [...prev, kind]
    })
  }

  const run = async (): Promise<void> => {
    if (selected.length === 0) return

    if (demoMode) {
      runner.startDemo(selected.map((kind) => ({ kindSlug: kind })), 'presets')
      return
    }

    const projectId = await guard.ensureSaved()
    if (projectId === null) return

    const boardPng = await boardPngDataUrl(model)
    if (boardPng.length > MAX_PNG_CHARS) return

    await runner.start({
      source: 'presets',
      projectId,
      walletRef: crypto.randomUUID(),
      boardPng,
      shots: selected.map((kind) => {
        const edited = sceneEdits[kind]
        return edited !== undefined && edited.trim() !== SCENES[kind] ? { kind, scene: edited } : { kind }
      }),
    })
  }

  const shotsByKind = new Map(runner.shots.map((shot) => [shot.kindSlug, shot]))
  const description = design.name

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
          disabled={runner.busy || gate.locked || selected.length === 0}
          onClick={() => { void run() }}
        >
          <Sparkles data-icon="inline-start" />
          {runner.busy ? t(locale, 'promo.busy') : t(locale, 'promo.generate')}
        </Button>
      </div>

      {/* Аноним: замок и текст «войдите» уже рисует AiGateNote (ai.gate.anonymous,
          спека 4.3 переиспользует существующий гейт вместо второй, дублирующей
          проверки). Здесь - отдельное явное приглашение прямо у кнопки, P0-9. */}
      {!demoMode && !user ? (
        <p data-testid="promo-signin-invite" className="text-[13px] text-ink-secondary">
          {t(locale, 'promo.signInInvite')}
        </p>
      ) : null}

      <p className="max-w-[68ch] text-[13px] text-ink-secondary">{t(locale, 'promo.subtitle')}</p>

      {!demoMode && user ? (
        <p data-testid="promo-project-plaque" className="text-[13px] text-ink-secondary">
          {guard.state.kind === 'ready'
            ? t(locale, 'promo.project.saved', { name: guard.state.projectName })
            : guard.state.kind === 'failed'
              ? t(locale, 'promo.project.failed')
              : t(locale, 'promo.project.pending')}
        </p>
      ) : null}

      <fieldset className="flex flex-col gap-2" data-testid="promo-presets">
        <legend className="mb-1 text-[13px] font-semibold">{t(locale, 'promo.presets')}</legend>
        <div className="flex flex-wrap gap-2">
          {PROMO_SHOT_META.map((shot) => {
            const on = selected.includes(shot.kind)
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

      {/* Редактор промта (спека 6.1): один блок на каждый отмеченный пресет. */}
      <div className="flex flex-col gap-2">
        {selected.map((kind) => {
          const sceneValue = sceneEdits[kind] ?? SCENES[kind]
          const preview = composePrompt(sceneValue, description)
          return (
            <details key={kind} data-testid={`promo-prompt-editor-${kind}`} className="rounded-md border border-line-subtle bg-surface-raised px-3 py-2">
              <summary className="cursor-pointer text-[13px] font-semibold">
                {t(locale, 'promo.prompt.title')}: {t(locale, meta.get(kind)?.titleKey ?? 'promo.title')}
              </summary>
              <div className="mt-2 flex flex-col gap-2">
                <label className="flex flex-col gap-1 text-[13px]">
                  <span className="font-semibold">{t(locale, 'promo.prompt.scene')}</span>
                  <Textarea
                    rows={3}
                    maxLength={SCENE_MAX_CHARS}
                    data-testid="promo-prompt-scene"
                    value={sceneValue}
                    onChange={(e) => { setSceneEdits((prev) => ({ ...prev, [kind]: e.target.value })) }}
                  />
                </label>
                {checkScene(sceneValue).ok === false ? (
                  <p role="alert" className="text-xs font-semibold text-error-text">
                    {t(locale, 'promo.prompt.invalid')}
                  </p>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  data-testid="promo-prompt-reset"
                  onClick={() => { setSceneEdits((prev) => { const next = { ...prev }; delete next[kind]; return next }) }}
                >
                  {t(locale, 'promo.prompt.reset')}
                </Button>
                <p className="text-xs text-ink-muted">{t(locale, 'promo.prompt.locked')}</p>
                <div className="flex flex-col gap-1 text-[13px]">
                  <span className="font-semibold">{t(locale, 'promo.prompt.preview')}</span>
                  <pre data-testid="promo-prompt-preview" className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-surface-sunken p-2 font-mono text-xs text-ink-secondary">
                    {preview}
                  </pre>
                </div>
              </div>
            </details>
          )
        })}
      </div>

      {gate.showPaywall ? (
        <TrialPaywall locale={locale} />
      ) : (
        <AiGateNote gate={gate} locale={locale} testId={trialMode ? 'promo-trial-note' : 'promo-gate'} />
      )}

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
          {runner.series.status === 'partial' ? (
            <p data-testid="promo-partial-note" className="text-[13px] text-ink-secondary">
              {t(locale, 'promo.partial', { succeeded: runner.series.succeeded, failed: runner.series.failed })}
            </p>
          ) : null}
        </div>
      ) : null}

      <ul data-testid="promo-gallery" className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
        {selected.map((kind) => {
          const shotMeta = meta.get(kind)
          if (shotMeta === undefined) return null
          const shot = shotsByKind.get(kind)
          const status = shot?.status ?? null
          const showMock = shot === undefined || shot.url === null
          const variants = shot === undefined ? [] : runner.shots.filter((s) => s.parentShotId === shot.id)
          return (
            <li
              key={kind}
              data-testid={`promo-shot-${kind}`}
              data-shot-id={shot?.id}
              className="flex flex-col gap-2 overflow-hidden rounded-lg border border-line-subtle bg-surface-raised shadow-sm"
            >
              <div className="relative bg-canvas">
                {showMock ? (
                  <PromoMockShot layout={shotMeta.mock} model={model} />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={shot!.url!} alt={t(locale, shotMeta.titleKey)} className="block h-auto w-full" />
                )}
                {status !== null ? (
                  <Badge data-testid={STATUS_TESTID[status]} className="absolute top-2 right-2 bg-surface/90">
                    {t(locale, `promo.status.${status}` as MessageKey)}
                  </Badge>
                ) : null}
              </div>
              <div className="flex flex-col gap-1 px-3 pb-3">
                <span className="text-sm font-semibold">{t(locale, shotMeta.titleKey)}</span>
                <span className="text-[13px] text-ink-secondary">{t(locale, shotMeta.noteKey)}</span>
                {status === 'failed' && shot !== undefined && shot.retries < 3 ? (
                  <Button size="sm" variant="outline" data-testid={`promo-shot-retry-${shot.id}`} onClick={() => { void runner.retry(shot.id) }}>
                    {t(locale, 'promo.retry')}
                  </Button>
                ) : null}
                {status === 'blocked' ? <span className="text-xs text-ink-muted">{t(locale, 'promo.blockedHint')}</span> : null}
                {status === 'cancelled' ? <span className="text-xs text-ink-muted">{t(locale, 'promo.cancelledNote')}</span> : null}
                {status === 'done' && shot?.url ? (
                  <a
                    href={shot.url}
                    download={safeFileName(`${design.name}-${kind}`, 'png')}
                    className="mt-1 w-fit text-xs font-semibold text-accent underline-offset-4 hover:underline"
                  >
                    {t(locale, 'promo.download')}
                  </a>
                ) : null}
                {status === 'done' && shot !== undefined ? (
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid={`promo-shot-edit-${shot.id}`}
                    disabled={gate.locked}
                    onClick={() => {
                      setEditingId((prev) => (prev === shot.id ? null : shot.id))
                      setEditText('')
                    }}
                  >
                    {t(locale, 'promo.edit.button')}
                  </Button>
                ) : null}
                {editingId === shot?.id ? (
                  <div className="mt-1 flex flex-col gap-1.5">
                    <label className="flex flex-col gap-1 text-[13px]">
                      <span className="font-semibold">{t(locale, 'promo.edit.prompt')}</span>
                      <Textarea
                        rows={2}
                        maxLength={1000}
                        data-testid="promo-edit-input"
                        value={editText}
                        onChange={(e) => { setEditText(e.target.value) }}
                      />
                    </label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        data-testid={`promo-shot-edit-submit-${shot.id}`}
                        disabled={editBusy || editText.trim().length === 0}
                        onClick={() => { void submitEdit(shot) }}
                      >
                        {editBusy ? t(locale, 'promo.edit.busy') : t(locale, 'promo.edit.submit')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => { setEditingId(null); setEditText('') }}
                      >
                        {t(locale, 'promo.edit.cancel')}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
              {variants.length > 0 ? (
                <div
                  data-testid={`promo-variants-${shot!.id}`}
                  className="flex gap-2 overflow-x-auto border-t border-line-subtle bg-surface p-2"
                >
                  {variants.map((variant) => (
                    <div
                      key={variant.id}
                      data-testid={`promo-shot-${variant.id}`}
                      data-shot-id={variant.id}
                      className="flex w-32 shrink-0 flex-col gap-1"
                    >
                      <div className="relative bg-canvas">
                        {variant.url === null ? (
                          <PromoMockShot layout={shotMeta.mock} model={model} />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={variant.url} alt={t(locale, 'promo.variant', { n: variant.variantNo })} className="block h-auto w-full" />
                        )}
                        <Badge data-testid={STATUS_TESTID[variant.status]} className="absolute top-1 right-1 bg-surface/90 text-[10px]">
                          {t(locale, `promo.status.${variant.status}` as MessageKey)}
                        </Badge>
                      </div>
                      <span className="text-xs font-semibold">{t(locale, 'promo.variant', { n: variant.variantNo })}</span>
                      {variant.status === 'done' && variant.url ? (
                        <>
                          <a
                            href={variant.url}
                            download={safeFileName(`${design.name}-${kind}-v${variant.variantNo}`, 'png')}
                            className="w-fit text-xs font-semibold text-accent underline-offset-4 hover:underline"
                          >
                            {t(locale, 'promo.download')}
                          </a>
                          <Button
                            size="sm"
                            variant="outline"
                            data-testid={`promo-shot-edit-${variant.id}`}
                            disabled={gate.locked}
                            onClick={() => {
                              setEditingId((prev) => (prev === variant.id ? null : variant.id))
                              setEditText('')
                            }}
                          >
                            {t(locale, 'promo.edit.button')}
                          </Button>
                        </>
                      ) : null}
                      {editingId === variant.id ? (
                        <div className="flex flex-col gap-1.5">
                          <Textarea
                            rows={2}
                            maxLength={1000}
                            data-testid="promo-edit-input"
                            value={editText}
                            onChange={(e) => { setEditText(e.target.value) }}
                          />
                          <Button
                            type="button"
                            size="sm"
                            data-testid={`promo-shot-edit-submit-${variant.id}`}
                            disabled={editBusy || editText.trim().length === 0}
                            onClick={() => { void submitEdit(variant) }}
                          >
                            {editBusy ? t(locale, 'promo.edit.busy') : t(locale, 'promo.edit.submit')}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

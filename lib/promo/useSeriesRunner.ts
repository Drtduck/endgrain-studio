'use client'

import { useCallback, useRef, useState } from 'react'
import { cancelPromoSeriesAction, createPromoSeriesAction, editPromoShotAction, retryPromoShotAction, type PromoActionError } from '@/app/actions/promo'
import { runSeries, type RunnerHandle } from '@/lib/promo/runner'
import type { PromoSeriesInput } from '@/lib/promo/schema'
import type { PromoSeriesView, PromoShotView } from '@/lib/promo/types'
import { usePromoStore } from '@/lib/store/promo'

/**
 * Общее ядро job-пути (P0-3, P0-6) для PhotoSeries и ReferenceShots: заводит
 * серию, гонит её через lib/promo/runner, копит статусы кадров, даёт отмену
 * и повтор. Источник истины - ответы сервера, а не оптимистичный клиент:
 * каждый onShot/onSeries просто перезаписывает локальную карту по id.
 *
 * demoShots - режим без Supabase/AI-ключей (изолирован от job-пути намеренно,
 * см. app/actions/promo.ts: createPromoSeriesAction требует реальный проект и
 * аккаунт). В demo-режиме очередь эмулируется на клиенте без единого запроса:
 * так e2e и локальный дев без ключей видят тот же честный прогресс
 * queued -> running -> done, не требуя живого Supabase.
 */
export interface SeriesRunnerState {
  readonly series: PromoSeriesView | null
  readonly shots: readonly PromoShotView[]
  readonly busy: boolean
  readonly error: PromoActionError | 'failed' | null
}

export interface DemoShotSeed {
  readonly kindSlug: string
}

export interface SeriesRunner extends SeriesRunnerState {
  start(input: PromoSeriesInput): Promise<void>
  startDemo(seeds: readonly DemoShotSeed[], source?: PromoSeriesView['source']): void
  cancel(): void
  retry(shotId: string): Promise<void>
  /**
   * Правка кадра (спека 6.4): новый кадр рядом, оригинал не трогаем. В демо-режиме
   * (нет Supabase/ключей) правка эмулируется локально тем же честным конечным
   * автоматом queued -> running -> done, без единого сетевого запроса - ровно
   * как startDemo эмулирует основную серию.
   */
  edit(shot: PromoShotView, instruction: string): Promise<{ readonly ok: boolean }>
  reset(): void
  /**
   * Подхватывает уже существующую серию из базы вместо новой генерации (P0-6,
   * ревью 14.08.2026): вкладка «Промо» открылась заново (F5, другой визит), и
   * оплаченные, честно нарисованные кадры обязаны остаться видны, а не
   * пропасть с глаз только потому, что клиентское состояние пустое.
   *
   * projectShots - ВСЕ кадры проекта (или все активные кадры пользователя),
   * не только кадры этой серии: правки (source='edit') живут в ОТДЕЛЬНОЙ
   * серии, и чтобы варианты снова встали рядом со своим корневым кадром
   * (см. shotsByKind/variants в PhotoSeries), hydrate сам находит их по
   * parentShotId среди всего переданного набора.
   *
   * Серию со статусом queued/running докручивает тем же runSeries, что и
   * обычный старт - брошенный кадр доедет, как будто вкладку не закрывали.
   */
  hydrate(series: PromoSeriesView, projectShots: readonly PromoShotView[]): void
}

function demoShotView(id: string, seriesId: string, ordinal: number, kindSlug: string, status: PromoShotView['status']): PromoShotView {
  return {
    id,
    seriesId,
    kindSlug,
    ordinal,
    status,
    parentShotId: null,
    variantNo: 1,
    editPrompt: null,
    url: null,
    width: null,
    height: null,
    provider: 'mock',
    prompt: null,
    error: null,
    retries: 0,
  }
}

export function useSeriesRunner(): SeriesRunner {
  const [series, setSeries] = useState<PromoSeriesView | null>(null)
  const [shotsById, setShotsById] = useState<Readonly<Record<string, PromoShotView>>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<PromoActionError | 'failed' | null>(null)
  const runnerRef = useRef<RunnerHandle | null>(null)
  /** Оба таймера кадра (queued->running, running->done), по id: нужны, чтобы
   * отмена трогала только ещё не начатые кадры (спека 5.3), а не все разом. */
  const demoTimers = useRef<Map<string, { readonly running: ReturnType<typeof setTimeout>; readonly done: ReturnType<typeof setTimeout> }>>(new Map())
  /** Кадры демо-очереди, ещё не перешедшие в running: источник истины для cancel(),
   * потому что React state в замыкании таймера может быть устаревшим. */
  const demoQueued = useRef<Set<string>>(new Set())

  const upsertShot = useCallback((shot: PromoShotView) => {
    setShotsById((prev) => ({ ...prev, [shot.id]: shot }))
    // Зеркалим в общий стор (lib/store/promo.ts): PackDownload и ListingEditor
    // читают кадры оттуда, не завися от того, какая именно панель их нарисовала.
    usePromoStore.getState().upsertShot(shot)
  }, [])

  const reset = useCallback(() => {
    runnerRef.current?.cancel()
    for (const pair of demoTimers.current.values()) {
      clearTimeout(pair.running)
      clearTimeout(pair.done)
    }
    demoTimers.current = new Map()
    demoQueued.current = new Set()
    setSeries(null)
    setShotsById({})
    setBusy(false)
    setError(null)
  }, [])

  const start = useCallback(async (input: PromoSeriesInput): Promise<void> => {
    reset()
    setBusy(true)
    try {
      const res = await createPromoSeriesAction(input)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setSeries({
        id: res.data.seriesId,
        projectId: input.projectId,
        source: input.source,
        status: 'queued',
        requested: res.data.shots.length,
        succeeded: 0,
        failed: 0,
        createdAt: new Date().toISOString(),
        finishedAt: null,
      })
      setShotsById(Object.fromEntries(res.data.shots.map((s) => [s.id, s])))
      runnerRef.current = runSeries(
        res.data.shots.map((s) => s.id),
        upsertShot,
        setSeries,
      )
    } catch (err) {
      console.error(err)
      setError('failed')
    } finally {
      setBusy(false)
    }
  }, [reset, upsertShot])

  /** Демо-очередь: тот же конечный автомат состояний, без единого сетевого запроса. */
  const startDemo = useCallback((seeds: readonly DemoShotSeed[], source: PromoSeriesView['source'] = 'presets'): void => {
    reset()
    const seriesId = crypto.randomUUID()
    const seeded = seeds.map((seed, i) => ({ id: crypto.randomUUID(), ordinal: i, kindSlug: seed.kindSlug }))
    setSeries({
      id: seriesId,
      projectId: 'demo',
      source,
      status: 'queued',
      requested: seeded.length,
      succeeded: 0,
      failed: 0,
      createdAt: new Date().toISOString(),
      finishedAt: null,
    })
    setShotsById(
      Object.fromEntries(
        seeded.map(({ id, ordinal, kindSlug }) => [id, demoShotView(id, seriesId, ordinal, kindSlug, 'queued')]),
      ),
    )
    demoQueued.current = new Set(seeded.map((s) => s.id))
    seeded.forEach(({ id, ordinal, kindSlug }, i) => {
      const runningAt = 40 + i * 30
      const doneAt = runningAt + 80
      const runningTimer = setTimeout(() => {
        demoQueued.current.delete(id)
        upsertShot(demoShotView(id, seriesId, ordinal, kindSlug, 'running'))
      }, runningAt)
      const doneTimer = setTimeout(() => {
        upsertShot(demoShotView(id, seriesId, ordinal, kindSlug, 'done'))
        demoTimers.current.delete(id)
        // Пусто в demoTimers значит: ни одного ещё не рисующегося и ни одного
        // рисующегося кадра не осталось - отменённые (спека 5.3) в счёт не
        // идут, они уже вычеркнуты отсюда в cancel().
        const settled = demoTimers.current.size === 0
        setSeries((prev) =>
          prev === null
            ? prev
            : {
                ...prev,
                succeeded: prev.succeeded + 1,
                status: settled ? (prev.failed > 0 ? 'partial' : 'done') : 'running',
              },
        )
      }, doneAt)
      demoTimers.current.set(id, { running: runningTimer, done: doneTimer })
    })
  }, [reset, upsertShot])

  /**
   * Отмена (спека 5.3): только ещё не начатые кадры (demoQueued) уходят в
   * cancelled, уже рисующиеся доезжают сами. Серия закрывается сразу, если
   * начатых кадров не осталось, иначе остаётся 'running' до их завершения -
   * тот же самый setSeries-редьюсер в таймере done досчитает статус сам.
   */
  const cancel = useCallback(() => {
    runnerRef.current?.cancel()
    const cancelledIds = [...demoQueued.current]
    for (const id of cancelledIds) {
      const pair = demoTimers.current.get(id)
      if (pair !== undefined) {
        clearTimeout(pair.running)
        clearTimeout(pair.done)
        demoTimers.current.delete(id)
      }
    }
    demoQueued.current = new Set()
    if (cancelledIds.length > 0) {
      setShotsById((prev) => {
        const next = { ...prev }
        for (const id of cancelledIds) {
          const shot = next[id]
          if (shot !== undefined) next[id] = { ...shot, status: 'cancelled' }
        }
        return next
      })
      const settled = demoTimers.current.size === 0
      setSeries((prev) => {
        if (prev === null) return prev
        return {
          ...prev,
          status: !settled ? 'running' : prev.succeeded > 0 ? (prev.failed > 0 ? 'partial' : 'done') : 'cancelled',
        }
      })
    }
    if (series !== null && series.projectId !== 'demo') {
      void cancelPromoSeriesAction(series.id).then((res) => { if (res.ok) setSeries(res.data) })
    }
  }, [series])

  const retry = useCallback(async (shotId: string): Promise<void> => {
    const res = await retryPromoShotAction(shotId)
    if (!res.ok) return
    upsertShot(res.data)
    const handle = runSeries([shotId], upsertShot, setSeries)
    // Одиночный повтор не должен ждать других воркеров - серия уже почти вся исполнена.
    runnerRef.current = handle
  }, [upsertShot])

  /**
   * Правка кадра (спека 6.4): новый кадр рядом, оригинал не трогаем никогда.
   * rootId - корень группы вариантов (parentShotId у уже правленного кадра
   * указывает на корень, а не на непосредственного родителя - см. те же
   * правила в insertEditShot на сервере).
   *
   * onSeries тут намеренно пустой: правка технически отдельная серия из
   * одного кадра (source='edit'), и её собственный progress не должен
   * перезаписывать состояние основной серии, которое видит человек.
   */
  const edit = useCallback(async (shot: PromoShotView, instruction: string): Promise<{ readonly ok: boolean }> => {
    const rootId = shot.parentShotId ?? shot.id

    if (series !== null && series.projectId === 'demo') {
      const siblings = Object.values(shotsById).filter((s) => s.id === rootId || s.parentShotId === rootId)
      const nextVariantNo = 1 + Math.max(1, ...siblings.map((s) => s.variantNo))
      const newId = crypto.randomUUID()
      const seeded: PromoShotView = {
        // kindSlug 'edit', НЕ shot.kindSlug: галерея группирует кадры в
        // Map<kindSlug, shot> (см. PhotoSeries.tsx, shotsByKind) - тем же
        // kindSlug, что у корня, вариант перезаписал бы корень в этой карте
        // и variants-фильтр (по parentShotId) остался бы пуст. Сервер
        // (insertEditShot) делает ровно так же: kind_slug='edit'.
        ...demoShotView(newId, shot.seriesId, shot.ordinal, 'edit', 'queued'),
        parentShotId: rootId,
        variantNo: nextVariantNo,
        editPrompt: instruction,
      }
      upsertShot(seeded)
      demoQueued.current.add(newId)
      const runningTimer = setTimeout(() => {
        demoQueued.current.delete(newId)
        upsertShot({ ...seeded, status: 'running' })
      }, 60)
      const doneTimer = setTimeout(() => {
        upsertShot({ ...seeded, status: 'done' })
        demoTimers.current.delete(newId)
      }, 160)
      demoTimers.current.set(newId, { running: runningTimer, done: doneTimer })
      return { ok: true }
    }

    const res = await editPromoShotAction({ shotId: shot.id, instruction, walletRef: crypto.randomUUID() })
    if (!res.ok) {
      setError(res.error)
      return { ok: false }
    }
    upsertShot(res.data.shot)
    runSeries([res.data.shot.id], upsertShot, () => {})
    return { ok: true }
  }, [series, shotsById, upsertShot])

  const hydrate = useCallback((hydratedSeries: PromoSeriesView, projectShots: readonly PromoShotView[]): void => {
    runnerRef.current?.cancel()
    const ownShots = projectShots.filter((s) => s.seriesId === hydratedSeries.id)
    const ownIds = new Set(ownShots.map((s) => s.id))
    const variantShots = projectShots.filter((s) => s.parentShotId !== null && ownIds.has(s.parentShotId))
    const allShots = [...ownShots, ...variantShots]

    setSeries(hydratedSeries)
    setShotsById(Object.fromEntries(allShots.map((s) => [s.id, s])))
    for (const s of allShots) usePromoStore.getState().upsertShot(s)
    setError(null)

    // queued/running - брошенная серия (закрытая вкладка посреди генерации):
    // доигрываем ровно тем же путём, каким шла бы обычная генерация.
    const pendingIds = allShots.filter((s) => s.status === 'queued' || s.status === 'running').map((s) => s.id)
    runnerRef.current = pendingIds.length > 0 ? runSeries(pendingIds, upsertShot, setSeries) : null
  }, [upsertShot])

  const shots = Object.values(shotsById).sort((a, b) => a.ordinal - b.ordinal || a.variantNo - b.variantNo)

  return { series, shots, busy, error, start, startDemo, cancel, retry, edit, reset, hydrate }
}

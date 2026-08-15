import type { PromoSeriesView, PromoShotView } from './types'

/**
 * Клиентский исполнитель серии (P0-3, спека 4.6). Гонит очередь кадров серии:
 * не больше SHOT_CONCURRENCY одновременно, каждый готовый кадр немедленно
 * уезжает в onShot. Отмена не убивает уже начатые кадры (они оплачены и
 * доедут), а перестаёт запускать новые - см. cancelPromoSeriesAction для
 * серверной половины отмены (queued -> cancelled, деньги за них не списаны).
 */
export const SHOT_CONCURRENCY = 4

export interface RunnerHandle {
  cancel(): void
}

interface ShotResponseBody {
  readonly shot: PromoShotView | null
  readonly series: PromoSeriesView | null
}

async function runOneShot(shotId: string): Promise<ShotResponseBody | null> {
  try {
    const res = await fetch('/api/promo/shot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shotId }),
    })
    if (!res.ok) return null
    return (await res.json()) as ShotResponseBody
  } catch (err) {
    console.error('[promo] shot runner request failed', err)
    return null
  }
}

export function runSeries(
  shotIds: readonly string[],
  onShot: (shot: PromoShotView) => void,
  onSeries: (series: PromoSeriesView) => void,
): RunnerHandle {
  const queue = [...shotIds]
  let cancelled = false

  async function worker(): Promise<void> {
    for (;;) {
      if (cancelled) return
      const shotId = queue.shift()
      if (shotId === undefined) return
      const body = await runOneShot(shotId)
      if (body === null) continue
      if (body.shot !== null) onShot(body.shot)
      if (body.series !== null) onSeries(body.series)
    }
  }

  const workerCount = Math.max(1, Math.min(SHOT_CONCURRENCY, shotIds.length))
  const workers = Array.from({ length: workerCount }, () => worker())
  void Promise.all(workers)

  return {
    cancel() {
      cancelled = true
      queue.length = 0
    },
  }
}

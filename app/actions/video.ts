'use server'

import { randomUUID } from 'node:crypto'
import { getSupabaseService, isSupabaseServiceConfigured } from '@/lib/supabase/service'
import { getCurrentUser } from '@/lib/supabase/session'
import { isFalConfigured, requestVideo } from '@/lib/video/fal'
import { isVideoSeconds, videoCostCents, type VideoSeconds } from '@/lib/video/pricing'

/**
 * Видео это оплаченное действие, а не Pro-фича: гейт это баланс кошелька, а не
 * подписка (см. спеку: за ролик уже платят живыми деньгами, требовать сверху
 * Pro значит взять двойную плату за одно действие). Требуется только вход
 * в аккаунт, без него нет и кошелька.
 *
 * Ключа fal.ai нет (FAL_API_KEY), поэтому генерация замокана: mockVideoJob
 * отдаёт заглушку без единого запроса наружу, а списание проходит только при
 * успехе мока - ровно так, как выглядело бы списание за настоящий ролик.
 */

export type VideoError = 'unauthenticated' | 'invalid' | 'insufficient' | 'unavailable' | 'failed'

export type VideoResult =
  | { readonly ok: true; readonly mock: true; readonly videoUrl: string; readonly posterUrl: string; readonly balanceCents: number }
  | { readonly ok: true; readonly mock: false; readonly videoUrl: string; readonly posterUrl: string; readonly balanceCents: number }
  | { readonly ok: false; readonly error: VideoError }

/** Заглушка мока: постер и «видео» это один и тот же кадр рендера доски, подписанный как демо. */
function mockVideoJob(boardPng: string): { readonly videoUrl: string; readonly posterUrl: string } {
  return { videoUrl: boardPng, posterUrl: boardPng }
}

export async function generateVideoAction(seconds: unknown, boardPng: unknown): Promise<VideoResult> {
  if (!isVideoSeconds(seconds) || typeof boardPng !== 'string' || boardPng.length === 0) {
    return { ok: false, error: 'invalid' }
  }
  const duration: VideoSeconds = seconds

  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }

  if (!isSupabaseServiceConfigured()) return { ok: false, error: 'unavailable' }

  const cost = videoCostCents(duration)
  if (cost === null) return { ok: false, error: 'invalid' }

  // ref это ключ идемпотентности обоих движений (списание и возможный возврат):
  // двойной клик по кнопке генерации не спишет дважды за одно и то же задание.
  const ref = randomUUID()
  const sb = getSupabaseService()

  const { data: balanceAfterSpend, error: spendError } = await sb.rpc('wallet_spend', {
    p_user_id: user.id,
    p_amount: cost,
    p_ref: ref,
  })
  if (spendError) {
    console.error('wallet_spend failed', spendError)
    return { ok: false, error: 'unavailable' }
  }
  if (balanceAfterSpend === null || balanceAfterSpend === undefined) {
    // Пустой returning из SQL-функции значит «не хватило денег», а не сбой базы.
    return { ok: false, error: 'insufficient' }
  }
  const balanceCents = Number(balanceAfterSpend)

  if (!isFalConfigured()) {
    const mock = mockVideoJob(boardPng)
    return { ok: true, mock: true, videoUrl: mock.videoUrl, posterUrl: mock.posterUrl, balanceCents }
  }

  const outcome = await requestVideo({ prompt: 'end-grain cutting board product video', seconds: duration, boardPng })
  if (outcome.ok) {
    return { ok: true, mock: false, videoUrl: outcome.videoUrl, posterUrl: outcome.posterUrl, balanceCents }
  }

  // Ролик не вышел вовсе: возвращаем списанное тем же ref, что и списание.
  const { error: refundError } = await sb.rpc('wallet_refund', { p_user_id: user.id, p_amount: cost, p_ref: ref })
  if (refundError) console.error('wallet_refund failed', refundError)
  return { ok: false, error: 'failed' }
}

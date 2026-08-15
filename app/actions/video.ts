'use server'

import { z } from 'zod'
import { readWallet } from '@/lib/wallet/server'
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
 * Ключа FAL нет (см. lib/promo/config.FAL_KEY), поэтому генерация замокана:
 * mockVideoJob отдаёт заглушку без единого запроса наружу. Демо-режим бесплатен -
 * isFalConfigured() проверяется РАНЬШЕ wallet_spend, и на мок-ветке кошелёк не
 * трогается вообще, только читается для отображения актуального баланса.
 * Списание идёт исключительно на пути настоящей генерации.
 */

export type VideoError = 'unauthenticated' | 'invalid' | 'insufficient' | 'unavailable' | 'failed'

export type VideoResult =
  | { readonly ok: true; readonly mock: true; readonly videoUrl: string; readonly posterUrl: string; readonly balanceCents: number }
  | { readonly ok: true; readonly mock: false; readonly videoUrl: string; readonly posterUrl: string; readonly balanceCents: number }
  | { readonly ok: false; readonly error: VideoError }

const refSchema = z.uuid()

/** Заглушка мока: постер и «видео» это один и тот же кадр рендера доски, подписанный как демо. */
function mockVideoJob(boardPng: string): { readonly videoUrl: string; readonly posterUrl: string } {
  return { videoUrl: boardPng, posterUrl: boardPng }
}

/**
 * ref это ключ идемпотентности списания и возможного возврата (см.
 * wallet_spend в supabase/migrations/20260813110000_wallet.sql). Генерируется
 * НА СЕРВЕРЕ, один раз на вызов action, и переиспользуется для парного
 * wallet_refund - иначе возврат не нашёл бы своё списание. Клиентский
 * аргумент ref остаётся в сигнатуре ради контракта вызова (VideoPanel.tsx
 * его всё ещё шлёт, генерируя свежий crypto.randomUUID() на каждый клик), но
 * его значение недоверенное и в rpc не используется: переиспользованный
 * клиентский ref через прямой вызов server action читался бы SQL-функцией
 * как «уже оплачено» и открывал бы бесплатную генерацию. Защита от двойного
 * клика на клиенте держится на setBusy, а не на этом ref.
 */
export async function generateVideoAction(seconds: unknown, boardPng: unknown, ref: unknown): Promise<VideoResult> {
  if (!isVideoSeconds(seconds) || typeof boardPng !== 'string' || boardPng.length === 0) {
    return { ok: false, error: 'invalid' }
  }
  // Валидация формы клиентского ref сохранена (защита от мусора во входе),
  // но само значение ниже не используется - см. джсдок выше.
  const parsedRef = refSchema.safeParse(ref)
  if (!parsedRef.success) return { ok: false, error: 'invalid' }
  const duration: VideoSeconds = seconds

  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }

  if (!isSupabaseServiceConfigured()) return { ok: false, error: 'unavailable' }

  // Демо-режим бесплатен: до кошелька дело не доходит вовсе, только читаем
  // текущий баланс, чтобы кошелёк на экране не «замер» после мок-генерации.
  if (!isFalConfigured()) {
    const mock = mockVideoJob(boardPng)
    const { balanceCents } = await readWallet(user.id)
    return { ok: true, mock: true, videoUrl: mock.videoUrl, posterUrl: mock.posterUrl, balanceCents }
  }

  const cost = videoCostCents(duration)
  if (cost === null) return { ok: false, error: 'invalid' }

  const sb = getSupabaseService()

  // Серверный ref один на всю попытку: используется и в wallet_spend, и (при
  // неудаче) в парном wallet_refund ниже - они обязаны совпадать.
  const spendRef = crypto.randomUUID()

  const { data: balanceAfterSpend, error: spendError } = await sb.rpc('wallet_spend', {
    p_user_id: user.id,
    p_amount: cost,
    p_ref: spendRef,
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

  const outcome = await requestVideo({ prompt: 'end-grain cutting board product video', seconds: duration, boardPng })
  if (outcome.ok) {
    return { ok: true, mock: false, videoUrl: outcome.videoUrl, posterUrl: outcome.posterUrl, balanceCents }
  }

  // Ролик не вышел вовсе: возвращаем списанное тем же ref, что и списание.
  const { error: refundError } = await sb.rpc('wallet_refund', { p_user_id: user.id, p_amount: cost, p_ref: spendRef })
  if (refundError) console.error('wallet_refund failed', refundError)
  return { ok: false, error: 'failed' }
}

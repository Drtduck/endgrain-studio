'use client'

import Link from 'next/link'
import { Lock } from 'lucide-react'
import { usePro } from '@/components/ProProvider'
import { AI_MONTHLY_LIMIT, AI_TRIAL_FEATURES, type AiAccess, type AiDenyReason, type AiFeature } from '@/lib/ai/quota'
import { t, type Locale, type MessageKey } from '@/lib/i18n'

/**
 * Клиентская половина гейта AI. Решение всё равно принимает сервер в
 * assertAiAllowed, здесь только честный текст и выключенная кнопка: молча
 * неработающая кнопка хуже замка с объяснением.
 *
 * Состояние приезжает из ProProvider, посчитанное в серверном layout, поэтому
 * ни эффекта, ни мигания «свободно -> замок» на первом кадре нет.
 */
export interface AiGateView {
  readonly locked: boolean
  /** Строка под панелью: замок с причиной либо остаток квоты. */
  readonly noteKey: MessageKey | null
  readonly params: Record<string, number>
  /** Показывать ли ссылку на тарифы: она уместна ровно во free-состоянии. */
  readonly showPricing: boolean
  /** Показывать ли ссылку на покупку пакета кадров: уместна, когда кадры кончились. */
  readonly showBuyFrames: boolean
  /** Показывать ли карточку TrialPaywall вместо панели: пробные генерации кончились. */
  readonly showPaywall: boolean
  readonly access: AiAccess
}

/**
 * remainingOverride позволяет обновить счётчик сразу после генерации: сервер
 * вернул остаток в ответе, и перезагружать страницу ради одной цифры незачем.
 *
 * feature решает, что делать в состоянии trial: часть промо-фич (серия кадров,
 * карточка на маркетплейс) входит в пробный тир и остаётся разблокированной,
 * а мокапы мерча и разбор референса - нет (AI_TRIAL_FEATURES). Раньше гейт
 * судил по общему ai.state и в trial открывал кнопку любой панели, включая ту,
 * что серверный assertAiAllowed всё равно отклонит: кнопка была живой, а нажатие
 * тихо ничего не делало. Теперь замок вешается заранее, по конкретной фиче.
 */
export function useAiGate(remainingOverride: number | null = null, feature: AiFeature): AiGateView {
  const { ai } = usePro()
  const remaining = remainingOverride ?? ai.remaining
  const limit = ai.limit || AI_MONTHLY_LIMIT
  // free/credits нужны шаблону ai.quota ("{free} бесплатных и {credits} купленных"):
  // без них плейсхолдеры остаются в тексте как есть (лечит дефект, вскрытый
  // job-путём - раньше строку не проверяли конкретными числами).
  const params = { limit, remaining, free: ai.freeRemaining, credits: ai.credits }

  switch (ai.state) {
    case 'mock':
      // Ключей нет, всё на локальных заглушках: замка не за что вешать.
      return { locked: false, noteKey: null, params, showPricing: false, showBuyFrames: false, showPaywall: false, access: ai }
    case 'unavailable':
      return { locked: true, noteKey: 'ai.gate.unavailable', params, showPricing: false, showBuyFrames: false, showPaywall: false, access: ai }
    case 'anonymous':
      return { locked: true, noteKey: 'ai.gate.anonymous', params, showPricing: false, showBuyFrames: false, showPaywall: false, access: ai }
    case 'free':
      return { locked: true, noteKey: 'ai.gate.free', params, showPricing: true, showBuyFrames: false, showPaywall: false, access: ai }
    case 'trial':
      if (!AI_TRIAL_FEATURES.includes(feature)) {
        // Эта фича Pro-only даже в пробном тире: замок заранее, а не молчание после клика.
        return { locked: true, noteKey: 'ai.gate.trialLocked', params, showPricing: true, showBuyFrames: false, showPaywall: false, access: ai }
      }
      // Не заперто: пробные генерации ещё есть, кнопка активна, счётчик под ней.
      // ai.credits > 0 значит, что у аккаунта на балансе есть купленные кадры
      // ПОВЕРХ пробных (P0-блокер приёмки 15.08.2026): ai.remaining тогда включает
      // и то, и другое, а ai.trial.left считает его строго против лимита пробного
      // тира ({limit}=3) - отсюда враньё вида «Осталось 13 из 3 пробных генераций».
      // Честная формулировка - та же, что и в состоянии 'credits'/на /account/billing.
      return ai.credits > 0
        ? { locked: false, noteKey: 'ai.quota', params, showPricing: false, showBuyFrames: false, showPaywall: false, access: ai }
        : { locked: false, noteKey: 'ai.trial.left', params, showPricing: false, showBuyFrames: false, showPaywall: false, access: ai }
    case 'trialSpent':
      // Заперто, и вместо строки-замка панель рисует TrialPaywall целиком.
      return { locked: true, noteKey: 'ai.gate.trialSpent', params, showPricing: false, showBuyFrames: false, showPaywall: true, access: ai }
    case 'pro':
      // Месячная квота Pro выбрана: докупка пакета кадров работает и для
      // Pro-аккаунта (AI_CREDIT_FEATURES не завязаны на тир), поэтому ссылка
      // на покупку обязана быть видна, а не только в состоянии 'credits'.
      return remaining <= 0
        ? { locked: true, noteKey: 'ai.gate.quota', params, showPricing: false, showBuyFrames: true, showPaywall: false, access: ai }
        : { locked: false, noteKey: 'ai.quota', params, showPricing: false, showBuyFrames: false, showPaywall: false, access: ai }
    case 'credits':
      // Пробное (или месячная квота Pro) кончилось, но на балансе есть купленные
      // кадры: кнопка живая, remaining уже включает и бесплатный остаток, и кадры.
      return remaining <= 0
        ? { locked: true, noteKey: 'ai.gate.noCredits', params, showPricing: false, showBuyFrames: true, showPaywall: false, access: ai }
        : { locked: false, noteKey: 'ai.quota', params, showPricing: false, showBuyFrames: false, showPaywall: false, access: ai }
  }
}

/**
 * Строка причины отказа, пришедшего с сервера в MerchResult.denied. Гейт на
 * клиенте теперь запирает кнопку заранее (см. useAiGate), но окно рассинхрона
 * остаётся: сессия истекла между загрузкой страницы и кликом, состояние в
 * ProProvider устарело. Отказ сервера не имеет права быть тишиной, поэтому его
 * тоже переводим в тот же AiGateNote, что рисует проактивный замок.
 */
const DENY_NOTE_KEY: Record<AiDenyReason, MessageKey> = {
  anonymous: 'ai.gate.anonymous',
  notPro: 'ai.gate.free',
  quota: 'ai.gate.quota',
  trialSpent: 'ai.gate.trialSpent',
  unavailable: 'ai.gate.unavailable',
  noCredits: 'ai.gate.noCredits',
}

export function denialGate(reason: AiDenyReason, access: AiAccess): AiGateView {
  const params = { limit: access.limit, remaining: access.remaining }
  return {
    locked: true,
    noteKey: DENY_NOTE_KEY[reason],
    params,
    showPricing: reason === 'notPro',
    showBuyFrames: reason === 'noCredits',
    showPaywall: false,
    access,
  }
}

/** Строка состояния доступа: замок с причиной или остаток квоты. */
export function AiGateNote({ gate, locale, testId }: { gate: AiGateView; locale: Locale; testId: string }) {
  if (gate.noteKey === null) return null
  return (
    <p
      data-testid={testId}
      className={
        gate.locked
          ? 'flex flex-wrap items-center gap-2 rounded-md border border-line-subtle bg-surface-raised px-3 py-[11px] text-[13px] text-ink-secondary'
          : 'text-[13px] text-ink-secondary'
      }
    >
      {gate.locked ? <Lock aria-hidden className="size-4 shrink-0" /> : null}
      <span>{t(locale, gate.noteKey, gate.params)}</span>
      {gate.showPricing ? (
        <Link
          href="/pricing"
          data-testid={`${testId}-pricing`}
          className="font-semibold text-accent underline-offset-4 hover:underline"
        >
          {t(locale, 'ai.gate.pricing')}
        </Link>
      ) : null}
      {gate.showBuyFrames ? (
        <Link
          href="/account/billing"
          data-testid={`${testId}-buy-frames`}
          className="font-semibold text-accent underline-offset-4 hover:underline"
        >
          {t(locale, 'ai.gate.buyFrames')}
        </Link>
      ) : null}
    </p>
  )
}

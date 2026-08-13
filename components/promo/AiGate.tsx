'use client'

import Link from 'next/link'
import { Lock } from 'lucide-react'
import { usePro } from '@/components/ProProvider'
import { AI_MONTHLY_LIMIT, type AiAccess } from '@/lib/ai/quota'
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
  /** Показывать ли карточку TrialPaywall вместо панели: пробные генерации кончились. */
  readonly showPaywall: boolean
  readonly access: AiAccess
}

/**
 * remainingOverride позволяет обновить счётчик сразу после генерации: сервер
 * вернул остаток в ответе, и перезагружать страницу ради одной цифры незачем.
 */
export function useAiGate(remainingOverride: number | null = null): AiGateView {
  const { ai } = usePro()
  const remaining = remainingOverride ?? ai.remaining
  const limit = ai.limit || AI_MONTHLY_LIMIT
  const params = { limit, remaining }

  switch (ai.state) {
    case 'mock':
      // Ключей нет, всё на локальных заглушках: замка не за что вешать.
      return { locked: false, noteKey: null, params, showPricing: false, showPaywall: false, access: ai }
    case 'unavailable':
      return { locked: true, noteKey: 'ai.gate.unavailable', params, showPricing: false, showPaywall: false, access: ai }
    case 'anonymous':
      return { locked: true, noteKey: 'ai.gate.anonymous', params, showPricing: false, showPaywall: false, access: ai }
    case 'free':
      return { locked: true, noteKey: 'ai.gate.free', params, showPricing: true, showPaywall: false, access: ai }
    case 'trial':
      // Не заперто: пробные генерации ещё есть, кнопка активна, счётчик под ней.
      return { locked: false, noteKey: 'ai.trial.left', params, showPricing: false, showPaywall: false, access: ai }
    case 'trialSpent':
      // Заперто, и вместо строки-замка панель рисует TrialPaywall целиком.
      return { locked: true, noteKey: 'ai.gate.trialSpent', params, showPricing: false, showPaywall: true, access: ai }
    case 'pro':
      return remaining <= 0
        ? { locked: true, noteKey: 'ai.gate.quota', params, showPricing: false, showPaywall: false, access: ai }
        : { locked: false, noteKey: 'ai.quota', params, showPricing: false, showPaywall: false, access: ai }
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
    </p>
  )
}

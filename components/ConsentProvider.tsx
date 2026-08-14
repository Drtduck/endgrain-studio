'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { detectGpc, writeConsent } from '@/lib/consent/client'
import { type ConsentDecision, type ConsentSource, isDecisionValidFor } from '@/lib/consent/cookie'
import type { ConsentRegime } from '@/lib/consent/regions'
import { updatePayload } from '@/lib/analytics/consentMode'
import { callGtag } from '@/lib/analytics/gtag'

export interface ConsentValue {
  readonly regime: ConsentRegime
  /** true, когда есть валидное решение и оно granted. */
  readonly analytics: boolean
  /** true, когда есть валидное для текущего региона решение (баннер прятать можно). */
  readonly decided: boolean
  readonly gpc: boolean
  readonly decision: ConsentDecision | null
  readonly choose: (analytics: boolean, source: ConsentSource) => void
  /** Сбрасывает текущее решение локально (cookie не трогает) - баннер снова видим. */
  readonly reopen: () => void
}

const ConsentContext = createContext<ConsentValue | null>(null)

/** Зовёт gtag('consent','update', ...) через общий помощник (lib/analytics/gtag.ts). */
function pushConsentUpdate(analytics: boolean): void {
  callGtag('consent', 'update', updatePayload(analytics))
}

/**
 * GPC - полноценный opt-out в обоих режимах, но явный выбор человека сильнее сигнала:
 * срабатывает только когда решения нет либо оно само пришло от GPC, и не повторяется,
 * если решение уже и так denied по GPC.
 */
function gpcOverride(
  gpc: boolean,
  regime: ConsentRegime,
  initialDecision: ConsentDecision | null
): ConsentDecision | null {
  if (!gpc) return null
  const eligible = initialDecision === null || initialDecision.source === 'gpc'
  if (!eligible) return null
  const alreadyGpcDenied = initialDecision !== null && initialDecision.source === 'gpc' && !initialDecision.analytics
  if (alreadyGpcDenied) return null
  return { analytics: false, regime, source: 'gpc', at: Math.floor(Date.now() / 1000) }
}

export interface ConsentProviderProps {
  readonly regime: ConsentRegime
  readonly initialDecision: ConsentDecision | null
  readonly children: ReactNode
}

/**
 * Серверное значение регистра и решения приезжает пропом, как в SessionProvider,
 * ProProvider и GoogleAuthProvider: первый же HTML либо содержит баннер, либо нет,
 * и гидрация не расходится. Дальше состояние живёт на клиенте: choose() пишет
 * cookie, обновляет Consent Mode и триггерит перерендер баннера.
 *
 * GPC-автовыбор и итоговое decision считаются один раз ленивым инициализатором
 * useState, а не эффектом с setState: так на клиенте нет второго, каскадного
 * рендера ради значения, которое известно уже на первом (react-hooks/set-state-in-effect
 * запрещает именно синхронный setState внутри эффекта). Эффект ниже только
 * синхронизирует внешние системы (cookie, dataLayer) под уже готовое состояние
 * и сам никогда не вызывает сеттер React.
 */
export function ConsentProvider({ regime, initialDecision, children }: ConsentProviderProps) {
  // На сервере navigator недоступен, detectGpc() честно даёт false; расхождение с
  // клиентом не рассинхронизирует разметку, потому что от gpc зависит только то,
  // какая из панелей согласия рисуется на клиенте после монтирования.
  const [gpc] = useState(() => detectGpc())
  const [decision, setDecision] = useState<ConsentDecision | null>(
    () => gpcOverride(gpc, regime, initialDecision) ?? initialDecision
  )
  // Показ баннера через «Настройки cookie» не должен гасить аналитику, пока живёт
  // валидное granted-решение: decision(cookie) остаётся источником analytics,
  // forceBannerVisible - чисто UI-флаг «баннер снова на экране».
  const [forceBannerVisible, setForceBannerVisible] = useState(false)
  const strictDeniedSent = useRef(false)
  const gpcWriteSent = useRef(false)

  const choose = (analytics: boolean, source: ConsentSource): void => {
    const next: ConsentDecision = { analytics, regime, source, at: Math.floor(Date.now() / 1000) }
    writeConsent(next)
    pushConsentUpdate(analytics)
    setDecision(next)
    // Новый явный выбор закрывает баннер, открытый через reopen(), сам по себе.
    setForceBannerVisible(false)
  }

  useEffect(() => {
    // Если начальное состояние уже несёт GPC-автовыбор (посчитан в инициализаторе
    // выше), запись cookie и dataLayer - побочный эффект на внешние системы,
    // а не React-состояние, поэтому ей место здесь, а не в инициализаторе.
    if (!gpcWriteSent.current && gpc && decision !== null && decision.source === 'gpc') {
      gpcWriteSent.current = true
      writeConsent(decision)
      pushConsentUpdate(decision.analytics)
      return
    }
    // Рассинхрон механизмов: наш UI строгий opt-in, а региональное правило Google
    // могло посчитать посетителя не-европейцем. Отказ всегда побеждает.
    if (regime === 'opt-in' && !isDecisionValidFor(decision, regime) && !strictDeniedSent.current) {
      strictDeniedSent.current = true
      pushConsentUpdate(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const validDecision = isDecisionValidFor(decision, regime) ? decision : null

  // Ссылка «Настройки cookie» в футере зовёт это вместо навигации: cookie eg-consent
  // не трогается и decision не сбрасывается (аналитика продолжает идти по уже
  // выданному granted-решению), баннер просто показывается снова поверх текущего
  // состояния - до нового явного выбора в choose().
  const reopen = (): void => setForceBannerVisible(true)

  const value: ConsentValue = {
    regime,
    analytics: validDecision?.analytics ?? false,
    decided: validDecision !== null && !forceBannerVisible,
    gpc,
    decision,
    choose,
    reopen,
  }

  return <ConsentContext value={value}>{children}</ConsentContext>
}

export function useConsent(): ConsentValue {
  const ctx = useContext(ConsentContext)
  if (ctx === null) {
    throw new Error('useConsent must be used within ConsentProvider')
  }
  return ctx
}

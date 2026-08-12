'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { ProStatus } from '@/lib/stripe/pro'

export interface ProValue {
  readonly status: ProStatus
  /** true, когда касса настроена и можно показывать кнопки оплаты. */
  readonly billingEnabled: boolean
}

/**
 * Дефолт открытый, а не закрытый, сознательно: компонент, отрендеренный вне
 * провайдера (например, в юнит-тесте), не должен показывать замок на пустом месте.
 */
const DEFAULT: ProValue = {
  status: { pro: true, reason: 'no-stripe', plan: null, currentPeriodEnd: null, cancelAtPeriodEnd: false },
  billingEnabled: false,
}

const ProContext = createContext<ProValue>(DEFAULT)

export function ProProvider({ value, children }: { value: ProValue; children: ReactNode }) {
  return <ProContext value={value}>{children}</ProContext>
}

/**
 * Статус считается на сервере в app/layout.tsx и приезжает пропсом, как в
 * SessionProvider: никаких эффектов и никакого мигания «free -> pro».
 */
export function usePro(): ProValue {
  return useContext(ProContext)
}

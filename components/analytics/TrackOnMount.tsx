'use client'

import { useEffect } from 'react'
import { track, type AnalyticsEventName } from '@/lib/analytics/events'

/**
 * Только для событий без параметров (pricing_viewed, subscription_paid): у события
 * с параметрами (pdf_exported, checkout_started, project_saved) нет фиксированного
 * момента монтирования, они диспатчатся прямо из места, где параметр известен.
 */
type NoParamEventName = Extract<AnalyticsEventName, 'pricing_viewed' | 'subscription_paid'>

export interface TrackOnMountProps {
  readonly event: NoParamEventName
  /**
   * Ключ sessionStorage для защиты от повторов. Возврат из Stripe на
   * /?checkout=success человек может обновить или открыть из истории, и без
   * ключа мы бы посчитали несколько оплат за одну.
   */
  readonly once?: string
}

export function TrackOnMount({ event, once }: TrackOnMountProps) {
  useEffect(() => {
    if (once !== undefined) {
      if (typeof window === 'undefined' || window.sessionStorage.getItem(once) !== null) return
      window.sessionStorage.setItem(once, '1')
    }
    track(event)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}

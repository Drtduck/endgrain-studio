import Script from 'next/script'
import { defaultPayloads, updatePayload } from '@/lib/analytics/consentMode'
import { GA_MEASUREMENT_ID, isAnalyticsConfigured } from '@/lib/analytics/config'
import { isDecisionValidFor, type ConsentDecision } from '@/lib/consent/cookie'
import type { ConsentRegime } from '@/lib/consent/regions'

export interface AnalyticsProps {
  readonly regime: ConsentRegime
  readonly initialDecision: ConsentDecision | null
}

/**
 * Consent default обязан выполниться до gtag.js, иначе первый хит уйдёт без
 * ограничений. Поэтому инлайновый скрипт с двумя вызовами default (и, если решение
 * уже есть в cookie, сразу update) идёт первым, а next/script с самим gtag.js -
 * следом. Без measurement id компонент не рендерит ничего: ни одного тега,
 * ни одного запроса к googletagmanager.com.
 */
export function Analytics({ regime, initialDecision }: AnalyticsProps) {
  if (!isAnalyticsConfigured()) return null

  const [regional, global] = defaultPayloads()
  const validDecision = isDecisionValidFor(initialDecision, regime) ? initialDecision : null
  const initialUpdate = validDecision === null ? null : updatePayload(validDecision.analytics)

  const inline = [
    'window.dataLayer = window.dataLayer || [];',
    'function gtag(){dataLayer.push(arguments);}',
    `gtag('consent','default',${JSON.stringify(regional)});`,
    `gtag('consent','default',${JSON.stringify(global)});`,
    initialUpdate === null ? '' : `gtag('consent','update',${JSON.stringify(initialUpdate)});`,
  ].join('\n')

  return (
    <>
      <script data-testid="consent-mode-default" dangerouslySetInnerHTML={{ __html: inline }} />
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-config" strategy="afterInteractive">
        {`gtag('js', new Date());\ngtag('config', '${GA_MEASUREMENT_ID}');`}
      </Script>
    </>
  )
}

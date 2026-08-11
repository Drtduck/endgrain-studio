'use client'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { t, type MessageKey } from '@/lib/i18n'
import { useDerived } from '@/lib/store/derived'
import { useStudio } from '@/lib/store/studio'

export function DiagnosticsPanel() {
  const locale = useStudio((s) => s.locale)
  const { diagnostics } = useDerived()
  const errors = diagnostics.filter((d) => d.level === 'error').length
  const warnings = diagnostics.filter((d) => d.level === 'warning').length

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t(locale, 'diagnostics.title')}</CardTitle>
        {diagnostics.length > 0 ? (
          <p data-testid="diagnostics-counts" className="text-sm text-muted-foreground">
            {t(locale, 'diagnostics.counts', { errors, warnings })}
          </p>
        ) : null}
      </CardHeader>
      <CardContent>
        {diagnostics.length === 0 ? (
          <Badge variant="secondary">{t(locale, 'diagnostics.none')}</Badge>
        ) : (
          <ul data-testid="diagnostics-list" className="space-y-1 text-sm">
            {diagnostics.map((d, i) => (
              <li
                key={`${d.code}-${i}`}
                data-level={d.level}
                className={d.level === 'error' ? 'text-red-600' : 'text-amber-600'}
              >
                {t(locale, d.messageKey as MessageKey, d.params)}
                {d.target ? (
                  <span className="ml-1 text-muted-foreground">
                    ({t(locale, 'diagnostics.at', { panelId: d.target.panelId ?? '-', rowId: d.target.rowId ?? '-' })})
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

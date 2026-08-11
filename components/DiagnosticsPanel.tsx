'use client'

import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { t, type MessageKey } from '@/lib/i18n'
import { useDerived } from '@/lib/store/derived'
import { useStudio } from '@/lib/store/studio'
import type { DiagnosticLevel } from '@/lib/engine'

const ROW_STYLE: Record<'success' | DiagnosticLevel, { row: string; icon: string; title: string }> = {
  success: { row: 'bg-success-soft border-success-border', icon: 'text-success', title: 'text-success-text' },
  error: { row: 'bg-error-soft border-error-border', icon: 'text-error', title: 'text-error-text' },
  warning: { row: 'bg-warning-soft border-warning-border', icon: 'text-warning', title: 'text-warning-text' },
  info: { row: 'bg-surface border-line-subtle', icon: 'text-ink-muted', title: 'text-ink' },
}

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
          <p data-testid="diagnostics-counts" className="font-mono text-sm tabular-nums text-ink-muted">
            {t(locale, 'diagnostics.counts', { errors, warnings })}
          </p>
        ) : null}
      </CardHeader>
      <CardContent>
        {diagnostics.length === 0 ? (
          <div className={cn('flex gap-[9px] rounded-md border px-3 py-[11px]', ROW_STYLE.success.row)}>
            <CheckCircle2 className={cn('mt-px size-4 shrink-0', ROW_STYLE.success.icon)} strokeWidth={1.6} />
            <p className={cn('text-[13px] font-semibold', ROW_STYLE.success.title)}>{t(locale, 'diagnostics.none')}</p>
          </div>
        ) : (
          <ul data-testid="diagnostics-list" className="flex flex-col gap-2">
            {diagnostics.map((d, i) => {
              const style = ROW_STYLE[d.level]
              const Icon = d.level === 'error' ? AlertCircle : AlertTriangle
              return (
                <li
                  key={`${d.code}-${i}`}
                  data-level={d.level}
                  className={cn('flex gap-[9px] rounded-md border px-3 py-[11px]', style.row)}
                >
                  <Icon className={cn('mt-px size-4 shrink-0', style.icon)} strokeWidth={1.6} />
                  <p className={cn('text-[13px] font-semibold', style.title)}>
                    {t(locale, d.messageKey as MessageKey, d.params)}
                    {d.target ? (
                      <span className="ml-1 font-normal text-ink-muted">
                        ({t(locale, 'diagnostics.at', { panelId: d.target.panelId ?? '-', rowId: d.target.rowId ?? '-' })})
                      </span>
                    ) : null}
                  </p>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

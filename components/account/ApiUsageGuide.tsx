'use client'

import { useState } from 'react'
import { Check, ChevronDown, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { t, type Locale, type MessageKey } from '@/lib/i18n'
import { APP_ORIGIN } from '@/lib/routing/host'
import { cn } from '@/lib/utils'

/**
 * Мануал прямо на странице ключей: столяр не читает README на GitHub, ему
 * нужно тут же увидеть, как ключ превращается в работающий запрос. Секция
 * свёрнута по умолчанию - таблица ключей выше важнее с первого взгляда,
 * мануал открывают по необходимости (раздел 6/7 спеки REST и MCP).
 */

function CodeBlock({ testId, code }: { readonly testId: string; readonly code: string }) {
  const [copied, setCopied] = useState(false)

  const copy = (): void => {
    navigator.clipboard
      ?.writeText(code)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => {
        // Буфер обмена недоступен - молча остаёмся без успеха.
      })
  }

  return (
    <div data-testid={testId} className="relative">
      <pre className="overflow-x-auto rounded-md border border-line bg-surface px-3 py-2 pr-10 font-mono text-[12px] whitespace-pre-wrap text-ink">
        <code>{code}</code>
      </pre>
      <Button
        size="sm"
        variant="ghost"
        data-testid={`${testId}-copy`}
        className="absolute top-1 right-1"
        onClick={copy}
      >
        {copied ? <Check className="size-3.5 text-success-text" /> : <Copy className="size-3.5" />}
      </Button>
    </div>
  )
}

const MCP_TOOL_KEYS: readonly MessageKey[] = [
  'apiKeys.guideMcpToolListProjects',
  'apiKeys.guideMcpToolGetProject',
  'apiKeys.guideMcpToolCreateProject',
  'apiKeys.guideMcpToolUpdateProject',
  'apiKeys.guideMcpToolComputeCutlist',
]

const SCOPE_KEYS: readonly MessageKey[] = [
  'apiKeys.guideScopeProjectsRead',
  'apiKeys.guideScopeProjectsWrite',
  'apiKeys.guideScopeCutlistRead',
]

export function ApiUsageGuide({ locale }: { readonly locale: Locale }) {
  const [open, setOpen] = useState(false)

  const curlMe = `curl -H "Authorization: Bearer <your-api-key>" ${APP_ORIGIN}/api/v1/me`
  const curlList = `curl -H "Authorization: Bearer <your-api-key>" ${APP_ORIGIN}/api/v1/projects`
  const curlCreate = `curl -X POST -H "Authorization: Bearer <your-api-key>" -H "Content-Type: application/json" \\
  -d '{"name":"My board","design":{}}' \\
  ${APP_ORIGIN}/api/v1/projects`
  const mcpConnect = `claude mcp add --transport http endgrain ${APP_ORIGIN}/api/mcp --header "Authorization: Bearer <your-api-key>"`

  return (
    <div className="flex flex-col rounded-lg border border-line-subtle bg-surface-raised">
      <button
        type="button"
        data-testid="api-guide-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between gap-2 p-4 text-left"
      >
        <span className="font-display text-base font-semibold text-ink">{t(locale, 'apiKeys.guideToggle')}</span>
        <ChevronDown className={cn('size-4 shrink-0 text-ink-secondary transition-transform duration-hover', open ? 'rotate-180' : '')} />
      </button>

      {open ? (
        <div data-testid="api-guide-body" className="flex flex-col gap-5 border-t border-line-subtle p-4">
          <div className="flex flex-col gap-1.5">
            <span className="font-display text-sm font-semibold text-ink">{t(locale, 'apiKeys.guideWhatIsTitle')}</span>
            <p className="text-[13px] text-ink-secondary">{t(locale, 'apiKeys.guideWhatIsText')}</p>
          </div>

          <div className="flex flex-col gap-2">
            <span className="font-display text-sm font-semibold text-ink">{t(locale, 'apiKeys.guideCurlTitle')}</span>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-ink-muted">{t(locale, 'apiKeys.guideCurlMeLabel')}</span>
              <CodeBlock testId="api-guide-curl-me" code={curlMe} />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-ink-muted">{t(locale, 'apiKeys.guideCurlProjectsListLabel')}</span>
              <CodeBlock testId="api-guide-curl-list" code={curlList} />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-ink-muted">{t(locale, 'apiKeys.guideCurlProjectsCreateLabel')}</span>
              <CodeBlock testId="api-guide-curl-create" code={curlCreate} />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="font-display text-sm font-semibold text-ink">{t(locale, 'apiKeys.guideMcpTitle')}</span>
            <p className="text-[13px] text-ink-secondary">{t(locale, 'apiKeys.guideMcpText')}</p>
            <CodeBlock testId="api-guide-mcp-connect" code={mcpConnect} />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="font-display text-sm font-semibold text-ink">{t(locale, 'apiKeys.guideMcpToolsTitle')}</span>
            <ul data-testid="api-guide-mcp-tools" className="flex flex-col gap-1">
              {MCP_TOOL_KEYS.map((key) => (
                <li key={key} className="font-mono text-[12px] text-ink-secondary">
                  {t(locale, key)}
                </li>
              ))}
            </ul>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className="font-display text-sm font-semibold text-ink">{t(locale, 'apiKeys.guideLimitsTitle')}</span>
              <p className="text-[13px] text-ink-secondary">{t(locale, 'apiKeys.guideLimitsFree')}</p>
              <p className="text-[13px] text-ink-secondary">{t(locale, 'apiKeys.guideLimitsDeveloper')}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="font-display text-sm font-semibold text-ink">{t(locale, 'apiKeys.guideScopesTitle')}</span>
              {SCOPE_KEYS.map((key) => (
                <p key={key} className="font-mono text-[12px] text-ink-secondary">
                  {t(locale, key)}
                </p>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

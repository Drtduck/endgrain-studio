'use client'

import { useState, useTransition } from 'react'
import { createApiKeyAction, revokeApiKeyAction, type ApiKeySummary, type ApiKeysError } from '@/app/actions/apiKeys'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { t, type Locale, type MessageKey } from '@/lib/i18n'
import { APP_ORIGIN } from '@/lib/routing/host'

export interface ApiKeysPanelProps {
  readonly locale: Locale
  readonly initialKeys: readonly ApiKeySummary[]
}

const ERROR_KEYS: Readonly<Record<ApiKeysError, MessageKey>> = {
  unauthenticated: 'apiKeys.errAuth',
  invalid: 'apiKeys.errInvalid',
  limit: 'apiKeys.errLimit',
  notFound: 'apiKeys.errNotFound',
  unavailable: 'apiKeys.errUnavailable',
  failed: 'apiKeys.errFailed',
}

function formatDate(iso: string, locale: Locale): string {
  return new Date(iso).toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-US')
}

/**
 * Единственное место, где показывается plaintext ключа: сразу после создания,
 * крупным моноширинным блоком, с явным предупреждением и подтверждением на
 * закрытие. После закрытия компонент теряет значение навсегда - оно нигде
 * больше не хранится ни на клиенте, ни на сервере (раздел 9.2 спеки).
 */
function NewKeyReveal({ locale, plaintext, onClose }: { locale: Locale; plaintext: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(plaintext)
    setCopied(true)
  }

  const close = (): void => {
    if (!window.confirm(t(locale, 'apiKeys.closeConfirm'))) return
    onClose()
  }

  return (
    <div data-testid="api-key-reveal" className="flex flex-col gap-3 rounded-lg border border-accent-border bg-accent-soft p-4">
      <span className="font-display text-base font-semibold text-ink">{t(locale, 'apiKeys.newKeyTitle')}</span>
      <p className="text-[13px] text-ink-secondary">{t(locale, 'apiKeys.newKeyWarning')}</p>
      <code data-testid="api-key-plaintext" className="break-all rounded-md border border-line bg-surface px-3 py-2 font-mono text-[13px] text-ink">
        {plaintext}
      </code>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" data-testid="api-key-copy" onClick={() => void copy()}>
          {t(locale, copied ? 'apiKeys.copied' : 'apiKeys.copy')}
        </Button>
        <Button size="sm" data-testid="api-key-close" onClick={close}>
          {t(locale, 'apiKeys.close')}
        </Button>
      </div>
    </div>
  )
}

function KeyRow({ locale, item, onRevoked }: { locale: Locale; item: ApiKeySummary; onRevoked: (id: string) => void }) {
  const [busy, startTransition] = useTransition()
  const [error, setError] = useState<ApiKeysError | null>(null)

  const revoke = (): void => {
    if (!window.confirm(t(locale, 'apiKeys.revokeConfirm'))) return
    setError(null)
    startTransition(async () => {
      const res = await revokeApiKeyAction(item.id)
      if (res.ok) onRevoked(item.id)
      else setError(res.error)
    })
  }

  return (
    <tr data-testid="api-key-row" className="border-b border-line-subtle last:border-0">
      <td className="py-2 pr-3 text-sm text-ink">{item.name}</td>
      <td className="py-2 pr-3 font-mono text-xs text-ink-secondary">{item.prefix}...</td>
      <td className="py-2 pr-3 text-sm text-ink-secondary">{item.tier}</td>
      <td className="py-2 pr-3 text-sm text-ink-secondary">{formatDate(item.createdAt, locale)}</td>
      <td className="py-2 pr-3 text-sm text-ink-secondary">
        {item.lastUsedAt === null ? t(locale, 'apiKeys.never') : formatDate(item.lastUsedAt, locale)}
      </td>
      <td className="py-2 pr-3 text-sm text-ink-secondary">{item.usedToday}</td>
      <td className="py-2 text-right">
        {item.revokedAt !== null ? (
          <span data-testid="api-key-revoked-badge" className="text-xs text-ink-muted">
            {t(locale, 'apiKeys.revokedBadge')}
          </span>
        ) : (
          <Button size="sm" variant="destructive" data-testid="api-key-revoke" disabled={busy} onClick={revoke}>
            {busy ? t(locale, 'apiKeys.revoking') : t(locale, 'apiKeys.revoke')}
          </Button>
        )}
        {error === null ? null : <p className="mt-1 text-xs text-error-text">{t(locale, ERROR_KEYS[error])}</p>}
      </td>
    </tr>
  )
}

export function ApiKeysPanel({ locale, initialKeys }: ApiKeysPanelProps) {
  const [keys, setKeys] = useState<readonly ApiKeySummary[]>(initialKeys)
  const [name, setName] = useState('')
  const [busy, startTransition] = useTransition()
  const [error, setError] = useState<ApiKeysError | null>(null)
  const [reveal, setReveal] = useState<string | null>(null)

  const create = (): void => {
    setError(null)
    startTransition(async () => {
      const res = await createApiKeyAction(name)
      if (res.ok) {
        setKeys((prev) => [res.data.summary, ...prev])
        setReveal(res.data.plaintext)
        setName('')
      } else {
        setError(res.error)
      }
    })
  }

  const mcpConfig = JSON.stringify(
    { mcpServers: { 'endgrain-studio': { url: `${APP_ORIGIN}/api/mcp`, headers: { Authorization: 'Bearer <your-api-key>' } } } },
    null,
    2,
  )
  const curlExample = `curl -H "Authorization: Bearer <your-api-key>" ${APP_ORIGIN}/api/v1/me`

  return (
    <div data-testid="api-keys-panel" className="flex flex-col gap-6">
      {reveal === null ? null : <NewKeyReveal locale={locale} plaintext={reveal} onClose={() => setReveal(null)} />}

      <div className="flex flex-col gap-2 rounded-lg border border-line-subtle bg-surface-raised p-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="api-key-name" className="text-xs text-ink-secondary">
              {t(locale, 'apiKeys.createLabel')}
            </label>
            <Input
              id="api-key-name"
              data-testid="api-key-name-input"
              value={name}
              placeholder={t(locale, 'apiKeys.createPlaceholder')}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
            />
          </div>
          <Button data-testid="api-key-create" disabled={busy || name.trim().length === 0} onClick={create}>
            {busy ? t(locale, 'apiKeys.creating') : t(locale, 'apiKeys.createButton')}
          </Button>
        </div>
        {error === null ? null : (
          <p role="alert" data-testid="api-key-error" className="text-sm text-error-text">
            {t(locale, ERROR_KEYS[error])}
          </p>
        )}
      </div>

      {keys.length === 0 ? (
        <p data-testid="api-keys-empty" className="text-sm text-ink-secondary">
          {t(locale, 'apiKeys.empty')}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line-subtle bg-surface-raised p-4">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-line-subtle text-xs text-ink-muted">
                <th className="pb-2 pr-3 font-medium">{t(locale, 'apiKeys.tableName')}</th>
                <th className="pb-2 pr-3 font-medium">{t(locale, 'apiKeys.tablePrefix')}</th>
                <th className="pb-2 pr-3 font-medium">{t(locale, 'apiKeys.tableTier')}</th>
                <th className="pb-2 pr-3 font-medium">{t(locale, 'apiKeys.tableCreated')}</th>
                <th className="pb-2 pr-3 font-medium">{t(locale, 'apiKeys.tableLastUsed')}</th>
                <th className="pb-2 pr-3 font-medium">{t(locale, 'apiKeys.tableUsageToday')}</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {keys.map((item) => (
                <KeyRow
                  key={item.id}
                  locale={locale}
                  item={item}
                  onRevoked={(id) =>
                    setKeys((prev) => prev.map((k) => (k.id === id ? { ...k, revokedAt: new Date().toISOString() } : k)))
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-lg border border-line-subtle bg-surface-raised p-4">
        <span className="font-display text-base font-semibold text-ink">{t(locale, 'apiKeys.howToConnect')}</span>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-ink-muted">{t(locale, 'apiKeys.curlLabel')}</span>
          <pre className="overflow-x-auto rounded-md border border-line bg-surface px-3 py-2 font-mono text-[12px] text-ink">
            <code>{curlExample}</code>
          </pre>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-ink-muted">{t(locale, 'apiKeys.mcpLabel')}</span>
          <pre className="overflow-x-auto rounded-md border border-line bg-surface px-3 py-2 font-mono text-[12px] text-ink">
            <code>{mcpConfig}</code>
          </pre>
        </div>
      </div>
    </div>
  )
}

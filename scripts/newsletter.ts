// CLI для маркетинговых рассылок через Kit (бывший ConvertKit), API v4.
// Системные письма приложения (Resend) этот скрипт не трогает.
// Запускается напрямую в Node (>=22.18 стирает типы сам, tsx не нужен).
// Запуск: pnpm newsletter <команда> ...
//   pnpm newsletter draft docs/newsletter/2026-08.md
//   pnpm newsletter list
//   pnpm newsletter schedule <id> 2026-09-01T09:00:00Z
//   pnpm newsletter stats <id>
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

// .env.local не читается автоматически вне `next dev`/`next build`, поэтому
// подхватываем его сами через встроенный в Node загрузчик (без dotenv).
const ENV_LOCAL_PATH = path.resolve(import.meta.dirname, '../.env.local')
if (existsSync(ENV_LOCAL_PATH)) {
  process.loadEnvFile(ENV_LOCAL_PATH)
}

const KIT_API_KEY = process.env['KIT_API_KEY'] ?? ''
const KIT_FROM_EMAIL = process.env['KIT_FROM_EMAIL'] ?? ''
const KIT_API_BASE = 'https://api.kit.com'
const SITE_URL = 'https://endgrain.app'

interface KitBroadcastSummary {
  id: number | string
  subject?: string
  status?: string
  created_at?: string
  send_at?: string | null
}

/** Общий вызов Kit API: заголовок авторизации и человекочитаемая ошибка вместо стектрейса. */
async function kitFetch(pathname: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${KIT_API_BASE}${pathname}`, {
    ...init,
    headers: {
      'X-Kit-Api-Key': KIT_API_KEY,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  })
  const body = (await res.json().catch(() => ({}))) as unknown
  if (!res.ok) {
    const message = body && typeof body === 'object' && 'message' in body ? String((body as { message: unknown }).message) : res.statusText
    throw new Error(`Kit API ${res.status}: ${message}`)
  }
  return body
}

/** Экранирование под HTML-тело письма: markdown в файле доверенный (пишет сам Стас), но теги ломать верстку не должны. */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Инлайн-разметка внутри строки: ссылки, жирный, курсив. Порядок важен: ссылки раньше звёздочек. */
function renderInline(text: string): string {
  let out = escapeHtml(text)
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#7a5230;">$1</a>')
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
  return out
}

/**
 * Минимальный собственный рендер markdown -> HTML: заголовки, абзацы, списки, ссылки, жирный/курсив.
 * Этого достаточно для текста рассылки, полноценный парсер не нужен, новую зависимость не ставим.
 */
function renderMarkdownToHtml(markdownBody: string): string {
  const blocks = markdownBody.trim().split(/\n\s*\n/)
  const html: string[] = []
  for (const block of blocks) {
    const lines = block.split('\n').filter((line) => line.trim().length > 0)
    if (lines.length === 0) continue
    const headingMatch = /^(#{1,3})\s+(.*)$/.exec(lines[0] ?? '')
    if (headingMatch && lines.length === 1) {
      const level = headingMatch[1]?.length === 1 ? 'h2' : 'h3'
      html.push(`<${level} style="margin:24px 0 8px;">${renderInline(headingMatch[2] ?? '')}</${level}>`)
      continue
    }
    const isList = lines.every((line) => /^[-*]\s+/.test(line))
    if (isList) {
      const items = lines.map((line) => `<li>${renderInline(line.replace(/^[-*]\s+/, ''))}</li>`).join('')
      html.push(`<ul style="padding-left:20px;">${items}</ul>`)
      continue
    }
    html.push(`<p style="margin:0 0 16px;">${lines.map(renderInline).join('<br>')}</p>`)
  }
  return html.join('\n')
}

/** Простая обёртка письма: белый фон, до 600px, системный шрифт, ссылка на сайт в подвале. */
function wrapEmailHtml(bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f5f1ea;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f1ea;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;">
            <tr>
              <td style="padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:16px;line-height:1.5;color:#1c1a17;">
                ${bodyHtml}
                <p style="margin:32px 0 0;font-size:13px;color:#8a8177;border-top:1px solid #eee;padding-top:16px;">
                  <a href="${SITE_URL}" style="color:#8a8177;">${SITE_URL}</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

function requireKitKey(): void {
  if (KIT_API_KEY.length === 0) {
    console.error('Не хватает KIT_API_KEY. Возьми ключ на https://app.kit.com/account_settings/developer_settings и впиши в .env.local.')
    process.exit(1)
  }
}

async function cmdDraft(filePath: string | undefined): Promise<void> {
  if (!filePath) {
    console.error('Нужен путь к markdown-файлу: pnpm newsletter draft <файл.md>')
    process.exit(1)
  }
  requireKitKey()

  const raw = await readFile(filePath, 'utf8')
  const lines = raw.split('\n')
  const titleLine = lines.find((line) => line.trim().startsWith('# '))
  if (!titleLine) {
    console.error('В файле нет заголовка первой строкой вида "# Тема письма".')
    process.exit(1)
  }
  const subject = titleLine.replace(/^#\s+/, '').trim()
  const bodyMarkdown = raw.replace(titleLine, '').trim()
  const content = wrapEmailHtml(renderMarkdownToHtml(bodyMarkdown))

  const payload: Record<string, unknown> = {
    subject,
    content,
    public: false,
    send_at: null,
  }
  if (KIT_FROM_EMAIL.length > 0) payload['email_address'] = KIT_FROM_EMAIL

  const body = (await kitFetch('/v4/broadcasts', {
    method: 'POST',
    body: JSON.stringify(payload),
  })) as { broadcast?: { id?: number | string } }

  const id = body.broadcast?.id
  console.log(`Черновик создан: "${subject}"`)
  console.log(`id: ${String(id ?? '?')}`)
  console.log(`ссылка: https://app.kit.com/broadcasts/${String(id ?? '')}`)
}

async function cmdList(): Promise<void> {
  requireKitKey()
  const body = (await kitFetch('/v4/broadcasts', { method: 'GET' })) as { broadcasts?: KitBroadcastSummary[] }
  const broadcasts = body.broadcasts ?? []
  if (broadcasts.length === 0) {
    console.log('Рассылок пока нет.')
    return
  }
  for (const b of broadcasts) {
    console.log(`${b.id}\t${b.status ?? '?'}\t${b.send_at ?? 'черновик'}\t${b.subject ?? '(без темы)'}`)
  }
}

async function cmdSchedule(id: string | undefined, sendAt: string | undefined): Promise<void> {
  if (!id || !sendAt) {
    console.error('Нужны id и время: pnpm newsletter schedule <id> <ISO8601>')
    process.exit(1)
  }
  if (Number.isNaN(Date.parse(sendAt))) {
    console.error(`Не похоже на ISO8601: "${sendAt}". Пример: 2026-09-01T09:00:00Z`)
    process.exit(1)
  }
  requireKitKey()
  await kitFetch(`/v4/broadcasts/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ send_at: sendAt }),
  })
  console.log(`Рассылка ${id} запланирована на ${sendAt}.`)
}

async function cmdStats(id: string | undefined): Promise<void> {
  if (!id) {
    console.error('Нужен id: pnpm newsletter stats <id>')
    process.exit(1)
  }
  requireKitKey()
  const body = await kitFetch(`/v4/broadcasts/${id}/stats`, { method: 'GET' })
  console.log(JSON.stringify(body, null, 2))
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2)
  switch (command) {
    case 'draft':
      await cmdDraft(args[0])
      return
    case 'list':
      await cmdList()
      return
    case 'schedule':
      await cmdSchedule(args[0], args[1])
      return
    case 'stats':
      await cmdStats(args[0])
      return
    default:
      console.error('Команды: draft <файл.md> | list | schedule <id> <ISO8601> | stats <id>')
      process.exit(1)
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})

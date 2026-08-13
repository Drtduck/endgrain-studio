import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import { ENGINE_VERSION } from '@/lib/engine'
import { verifyMcpToken } from '@/lib/api/auth'
import { registerEndgrainTools } from '@/lib/api/mcpTools'

/**
 * MCP-сервер поверх того же сервисного слоя, что REST v1 (lib/api/service.ts).
 * verifyMcpToken (lib/api/auth.ts) - тот же конвейер шагов 1-5 раздела 3
 * дизайн-документа, что использует REST; скоуп и квота у каждого инструмента
 * свои и проверяются внутри него (lib/api/mcpTools.ts:requireCaller), потому
 * что requiredScopes на уровне withMcpAuth здесь общий для всех инструментов
 * быть не может.
 *
 * RFC 9728 и полный OAuth 2.1 не делаем: Bearer-ключ как токен - ровно то,
 * что делает Stripe в своём MCP. Место для расширения оставлено тем, что
 * withMcpAuth умеет resourceMetadataPath из коробки.
 *
 * delete_project сознательно отсутствует среди инструментов (раздел 7):
 * удаление необратимо, агент с ключом на чтение и запись не должен уметь
 * стереть работу одним неверно понятым запросом. Через REST удаление есть.
 */
const handler = createMcpHandler(registerEndgrainTools, {
  serverInfo: { name: 'endgrain-studio', version: ENGINE_VERSION },
  verboseLogs: false,
})

const authed = withMcpAuth(handler, verifyMcpToken, { required: true, requiredScopes: [] })

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export { authed as GET, authed as POST, authed as DELETE }

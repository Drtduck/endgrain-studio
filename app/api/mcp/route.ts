import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import type { AuthInfo, McpServer } from '@modelcontextprotocol/server'
import { ENGINE_VERSION } from '@/lib/engine'

/**
 * Первая версия роута: доказывает, что связка mcp-handler@2.1.0 +
 * @modelcontextprotocol/server@2.0.0 действительно работает в App Router до
 * того, как вокруг неё построится сервисный слой и полный набор инструментов.
 * verifyMcpToken здесь заглушка (принимает любой непустой Bearer-токен) и
 * заменяется на настоящую проверку из lib/api/auth.ts следующим коммитом,
 * когда появится таблица api_keys. Тул один, служебный, и исчезает вместе
 * с заглушкой.
 */
async function verifyMcpToken(_req: Request, bearerToken?: string): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined
  return { token: bearerToken, clientId: 'stub', scopes: [] }
}

function registerEndgrainTools(server: McpServer): void {
  server.registerTool(
    'ping',
    {
      title: 'Ping',
      description: 'Health check for the Endgrain Studio MCP server.',
      inputSchema: {},
    },
    async () => ({ content: [{ type: 'text' as const, text: 'pong' }], structuredContent: { pong: true } }),
  )
}

const handler = createMcpHandler(registerEndgrainTools, {
  serverInfo: { name: 'endgrain-studio', version: ENGINE_VERSION },
  verboseLogs: false,
})

const authed = withMcpAuth(handler, verifyMcpToken, { required: true, requiredScopes: [] })

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export { authed as GET, authed as POST, authed as DELETE }

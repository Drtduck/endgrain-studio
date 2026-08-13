# Ресерч: agent-ready SaaS и тариф Developer (техдолг п.10)

Дата: 13 августа 2026.

## 1. MCP поверх SaaS

- Тренд 2026: remote MCP - дефолт (Stripe mcp.stripe.com, Linear mcp.linear.app/mcp, Vercel, Notion). Транспорт: Streamable HTTP (SSE задепрекейчен спекой 2025-03-26).
- Хостинг на Vercel/Next.js: пакет **mcp-handler** (бывший @vercel/mcp-adapter). ВНИМАНИЕ: расхождение версий в источниках (1.1.0 vs 2.x c @modelcontextprotocol/server@^2 и zod@^4) - перед установкой проверить `npm view mcp-handler versions`.
- Паттерн: один роут `app/api/mcp/route.ts`, `createMcpHandler((server) => server.registerTool(...))`, export GET/POST.
- Auth: для MVP - API-ключ как Bearer (как Stripe restricted keys в MCP), полный OAuth 2.1 + RFC 9728 - позже. Хелперы withMcpAuth/protectedResourceHandler в mcp-handler.
- Шаблон: vercel.com/templates/next.js/model-context-protocol-mcp-with-next-js, github.com/vercel-labs/mcp-for-next.js.

## 2. API-ключи и Developer-тариф

- Паттерн микро-SaaS: Free tier с жёстким лимитом (тест интеграций) -> платный tier с объёмом и оверажем. Пример Resend: Free 3000/мес и 100/день, Pro $20/мес.
- Ключи: таблица в Supabase с хешем ключа (bcrypt/sha256), скоупы, показывать ключ один раз. Референс: gist.github.com/j4w8n/25d233194877f69c1cbf211de729afb2.
- Метеринг MVP: счётчик в Supabase (таблица usage), Stripe Billing Meters - позже.

## 3. Discoverability

- llms.txt (llmstxt.org): H1 + blockquote + секции `## ` со ссылками `- [Название](URL): описание`. Секция `## Optional` для второстепенного. Community-стандарт, адопция 5-15%, у AI-native компаний - золотой стандарт.
- ai-plugin.json/actions мертвы (плагины ChatGPT выключены 04.2024), OpenAI перешёл на MCP.
- OpenAPI-спека как источник правды; автогенерация MCP из OpenAPI: FastMCP, Speakeasy, openapi-mcp-generator.

## 4. MVP за день для Next.js+Supabase

1. Таблица api_keys (hash, scopes, limits) + REST API (Route Handlers) поверх существующих server-функций.
2. MCP-роут через mcp-handler с теми же функциями (не дублировать логику): create project, set pattern, compute cutlist, get PDF link.
3. /llms.txt.
4. Подводные камни: не копировать SSE-туториалы 2024-2025; проверить версию mcp-handler; rate limit простым счётчиком.

Основные источники: docs.stripe.com/mcp, linear.app/docs/mcp, npmjs.com/package/mcp-handler, vercel.com/changelog/mcp-server-support-on-vercel, llmstxt.org, supabase.com/docs/guides/getting-started/api-keys.

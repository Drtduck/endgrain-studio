import { ok, withApiAuth } from '@/lib/api/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Кто я, тир, остаток лимита. Любой валидный ключ, дешёвая проверка ключа стоит 1 запрос квоты. */
export const GET = withApiAuth(null, async (_req, caller) =>
  ok({ userId: caller.userId, tier: caller.tier, scopes: caller.scopes, usage: caller.usage }, caller),
)

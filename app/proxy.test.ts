import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { proxy } from '@/proxy'

/**
 * withCountryHeader() раньше звался только в ветке 'app', и весь трафик
 * site-домена (лендинг, блог) шёл без x-egs-country: каждый посетитель
 * лендинга получал region-агностичный opt-in вместо честного региона по IP
 * (см. proxy.ts). Эти тесты бьют по веткам, которые НЕ ходят в Supabase
 * (site-домен целиком и app/api/v1 на app-домене), поэтому обходятся без
 * моков updateSession - в отличие от общей ветки studio, которая делает поход
 * в базу и тестируется e2e (auth.spec.ts, consent.spec.ts).
 *
 * NextResponse передаёт переопределённые заголовки запроса вниз по конвейеру
 * не через обычные response.headers, а через служебные x-middleware-request-*
 * (см. node_modules/next/dist/server/web/spec-extension/response.js) - именно
 * их проверяют тесты ниже.
 */
function requestTo(url: string, headers: Record<string, string>): NextRequest {
  return new NextRequest(url, { headers })
}

describe('proxy(): x-egs-country доезжает до рендера на обоих доменах', () => {
  it('site-домен, корень (rewrite на /landing) несёт x-egs-country', async () => {
    const req = requestTo('https://endgrain.app/', { host: 'endgrain.app', 'x-vercel-ip-country': 'DE' })
    const res = await proxy(req)
    expect(res.headers.get('x-middleware-request-x-egs-country')).toBe('DE')
  })

  it('site-домен, /blog (isSitePath, NextResponse.next) несёт x-egs-country', async () => {
    const req = requestTo('https://endgrain.app/blog', { host: 'endgrain.app', 'x-vercel-ip-country': 'FR' })
    const res = await proxy(req)
    expect(res.headers.get('x-middleware-request-x-egs-country')).toBe('FR')
  })

  it('site-домен, /api/* (rewrite) несёт x-egs-country', async () => {
    const req = requestTo('https://endgrain.app/api/mcp', { host: 'endgrain.app', 'x-vercel-ip-country': 'US' })
    const res = await proxy(req)
    expect(res.headers.get('x-middleware-request-x-egs-country')).toBe('US')
  })

  it('app-домен, /api/v1/* (NextResponse.next, без похода в Supabase) несёт x-egs-country', async () => {
    const req = requestTo('https://app.endgrain.app/api/v1/me', { host: 'app.endgrain.app', 'x-vercel-ip-country': 'RU' })
    const res = await proxy(req)
    expect(res.headers.get('x-middleware-request-x-egs-country')).toBe('RU')
  })

  it('без x-vercel-ip-country заголовок просто не появляется - не ломает локалку и хостинг вне Vercel', async () => {
    const req = requestTo('https://endgrain.app/blog', { host: 'endgrain.app' })
    const res = await proxy(req)
    expect(res.headers.get('x-middleware-request-x-egs-country')).toBeNull()
  })
})

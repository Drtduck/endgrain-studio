import { NextRequest, NextResponse } from 'next/server'
import { describe, expect, it, vi } from 'vitest'
import { proxy } from '@/proxy'

/**
 * withCountryHeader() раньше звался только в ветке 'app', и весь трафик
 * site-домена (лендинг, блог) шёл без x-egs-country: каждый посетитель
 * лендинга получал region-агностичный opt-in вместо честного региона по IP
 * (см. proxy.ts). Эти тесты бьют по веткам, которые в тестовом окружении не
 * ходят в сеть Supabase (переменные NEXT_PUBLIC_SUPABASE_* не заданы,
 * updateSession() короткозамыкается на isSupabaseConfigured()), поэтому
 * обходятся без моков сети - в отличие от общей ветки studio, которая
 * тестируется e2e (auth.spec.ts, consent.spec.ts).
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

/**
 * Регресс на ПРОБЛЕМУ A: site-домен (лендинг, /blog) раньше не звал
 * updateSession() вовсе, поэтому протухший access-токен ротировался только
 * в RSC (app/layout.tsx -> getCurrentUser()), где cookie записать нельзя -
 * новый refresh-токен терялся, а старый Supabase уже отзывал. Следующий
 * заход на app-домен приходил с отозванным токеном и разлогинивал.
 *
 * updateSession() здесь замокан целиком (а не через переменные окружения
 * Supabase), чтобы гарантированно проверить перенос Set-Cookie на rewrite
 * и next() независимо от того, настроен ли Supabase в CI.
 */
vi.mock('@/lib/supabase/proxy', async () => {
  const actual = await vi.importActual<typeof import('@/lib/supabase/proxy')>('@/lib/supabase/proxy')
  return {
    ...actual,
    updateSession: vi.fn(async (request: NextRequest) => {
      const response = NextResponse.next({ request })
      response.cookies.set('sb-egs-auth', 'refreshed-token-value')
      return { response, authenticated: false }
    }),
  }
})

describe('proxy(): продление сессии Supabase переносится на все ответы site-хоста', () => {
  it('site-домен, корень (rewrite на /landing) несёт обновлённую auth-cookie', async () => {
    const req = requestTo('https://endgrain.app/', { host: 'endgrain.app' })
    const res = await proxy(req)
    expect(res.cookies.get('sb-egs-auth')?.value).toBe('refreshed-token-value')
  })

  it('site-домен, /blog (isSitePath, NextResponse.next) несёт обновлённую auth-cookie', async () => {
    const req = requestTo('https://endgrain.app/blog', { host: 'endgrain.app' })
    const res = await proxy(req)
    expect(res.cookies.get('sb-egs-auth')?.value).toBe('refreshed-token-value')
  })

  it('site-домен, чужой путь (редирект на app-домен) несёт обновлённую auth-cookie', async () => {
    const req = requestTo('https://endgrain.app/account', { host: 'endgrain.app' })
    const res = await proxy(req)
    expect(res.cookies.get('sb-egs-auth')?.value).toBe('refreshed-token-value')
  })

  it('site-домен, /api/* не ходит за сессией вовсе (нет cookie в ответе)', async () => {
    const req = requestTo('https://endgrain.app/api/mcp', { host: 'endgrain.app' })
    const res = await proxy(req)
    expect(res.cookies.get('sb-egs-auth')).toBeUndefined()
  })
})

import { expect, test } from '@playwright/test'

/**
 * Группа «без Supabase» гоняется всегда, в том числе в CI (webServer поднят
 * с PUBLIC_STUDIO=1, но без ключей Supabase): это самый ценный набор тестов
 * задачи, ровно в таком виде API поедет на конкурс. Сценарии «с Supabase»
 * (полный цикл через живую базу) в этот файл сознательно не входят - живого
 * Supabase в CI нет, а моков достаточно на уровне vitest (lib/api/*.test.ts).
 */

const JUNK_KEY = 'egs_live_00000000_' + 'x'.repeat(43)

test.describe('REST API v1 без ключей и без Supabase', () => {
  test('GET /api/v1/me без заголовка - 401 unauthorized', async ({ request }) => {
    const res = await request.get('/api/v1/me')
    expect(res.status()).toBe(401)
    const body = await res.json()
    expect(body.error.code).toBe('unauthorized')
  })

  test('GET /api/v1/me с мусором вместо ключа даёт тот же ответ байт в байт', async ({ request }) => {
    // Мусор, который даже не разбирается в форму ключа (в отличие от JUNK_KEY
    // ниже, у него правильная форма egs_live_...): оба случая обязаны кончаться
    // одинаковым unauthorized ещё до похода в Supabase, иначе перебором формы
    // заголовка можно было бы отличить «нет ключа» от «неверный ключ».
    const noHeader = await request.get('/api/v1/me')
    const junk = await request.get('/api/v1/me', { headers: { Authorization: 'Bearer not-even-a-key-shaped-string' } })
    expect(junk.status()).toBe(noHeader.status())
    expect(await junk.text()).toBe(await noHeader.text())
  })

  test('POST /api/v1/projects с ключом, но без Supabase - 503 unavailable', async ({ request }) => {
    const res = await request.post('/api/v1/projects', {
      headers: { Authorization: `Bearer ${JUNK_KEY}` },
      data: { name: 'доска', design: {} },
    })
    expect(res.status()).toBe(503)
    const body = await res.json()
    expect(body.error.code).toBe('unavailable')
  })

  test('POST /api/v1/cutlist без ключа - 401, расчёт не бесплатный вход', async ({ request }) => {
    const res = await request.post('/api/v1/cutlist', { data: { design: { schemaVersion: 2 } } })
    expect(res.status()).toBe(401)
  })

  test('GET /api/v1/projects отдаёт Cache-Control: no-store', async ({ request }) => {
    const res = await request.get('/api/v1/projects')
    expect(res.headers()['cache-control']).toBe('no-store')
  })

  test('POST /api/mcp без ключа - 401 и WWW-Authenticate присутствует', async ({ request }) => {
    const res = await request.post('/api/mcp', {
      data: { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    })
    expect(res.status()).toBe(401)
    expect(res.headers()['www-authenticate']).toBeTruthy()
  })

  test('POST /api/mcp с ключом на ненастроенном Supabase - структурированная ошибка, не 500 и не HTML', async ({ request }) => {
    const res = await request.post('/api/mcp', {
      headers: { Authorization: `Bearer ${JUNK_KEY}` },
      data: { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    })
    expect(res.status()).not.toBe(500)
    expect(res.headers()['content-type'] ?? '').not.toContain('text/html')
    // Тело обязано разбираться как JSON: и ошибка авторизации mcp-handler,
    // и наш собственный fail() отдают структуру, а не голый текст.
    await expect(res.json()).resolves.toBeTruthy()
  })

  test('тело больше лимита - 413 до разбора JSON', async ({ request }) => {
    const big = 'x'.repeat(600 * 1024)
    const res = await request.post('/api/v1/projects', {
      headers: { Authorization: `Bearer ${JUNK_KEY}`, 'Content-Type': 'application/json' },
      data: JSON.stringify({ name: big, design: {} }),
    })
    expect(res.status()).toBe(413)
  })

  test('корневой домен: /api/v1/me с Host: endgrain.app не редиректится', async ({ request }) => {
    const res = await request.get('/api/v1/me', { headers: { Host: 'endgrain.app' } })
    expect(res.status()).toBe(401)
    expect(res.url()).toContain('/api/v1/me')
  })
})

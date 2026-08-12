import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  FEEDBACK_ATTACHMENT_B64_MAX,
  FEEDBACK_MAX_LENGTH,
  FEEDBACK_SCREENSHOT_B64_MAX,
} from '@/lib/feedback'

const getUser = vi.fn()
const from = vi.fn()
const getHeader = vi.fn()
let configured = true

vi.mock('@/lib/supabase/config', () => ({
  isSupabaseConfigured: () => configured,
}))

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServer: async () => ({
    auth: { getUser },
    from,
  }),
}))

vi.mock('next/headers', () => ({
  headers: async () => ({ get: getHeader }),
}))

const upload = vi.fn()
const createSignedUrl = vi.fn()
const storageFrom = vi.fn(() => ({ upload, createSignedUrl }))
let serviceConfigured = true

vi.mock('@/lib/supabase/service', () => ({
  isSupabaseServiceConfigured: () => serviceConfigured,
  getSupabaseService: () => ({ storage: { from: storageFrom } }),
}))

/** Успешный ответ GitHub с телом issue, разобранным обратно из fetch-мока. */
function issueBodyFromFetch(fetchMock: ReturnType<typeof vi.fn>): string {
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
  return (JSON.parse(init.body as string) as { body: string }).body
}

describe('app/actions/feedback', () => {
  const originalToken = process.env['GITHUB_REPORT_TOKEN']
  const fetchMock = vi.fn()

  beforeEach(() => {
    configured = true
    serviceConfigured = true
    upload.mockReset()
    createSignedUrl.mockReset()
    storageFrom.mockClear()
    upload.mockResolvedValue({ error: null })
    createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://storage/signed' }, error: null })
    getUser.mockReset()
    from.mockReset()
    getHeader.mockReset()
    getHeader.mockReturnValue('vitest-agent')
    getUser.mockResolvedValue({ data: { user: null } })
    delete process.env['GITHUB_REPORT_TOKEN']
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    if (originalToken === undefined) delete process.env['GITHUB_REPORT_TOKEN']
    else process.env['GITHUB_REPORT_TOKEN'] = originalToken
    vi.unstubAllGlobals()
  })

  it('пустой текст даёт error: empty и не зовёт insert', async () => {
    const { submitFeedbackAction } = await import('./feedback')
    const res = await submitFeedbackAction({ body: '   ' })
    expect(res).toEqual({ ok: false, error: 'empty' })
    expect(from).not.toHaveBeenCalled()
  })

  it('2001 символ даёт error: tooLong', async () => {
    const { submitFeedbackAction } = await import('./feedback')
    const res = await submitFeedbackAction({ body: 'a'.repeat(FEEDBACK_MAX_LENGTH + 1) })
    expect(res).toEqual({ ok: false, error: 'tooLong' })
    expect(from).not.toHaveBeenCalled()
  })

  it('ненастроенный Supabase даёт error: disabled', async () => {
    configured = false
    const { submitFeedbackAction } = await import('./feedback')
    const res = await submitFeedbackAction({ body: 'привет' })
    expect(res).toEqual({ ok: false, error: 'disabled' })
    expect(from).not.toHaveBeenCalled()
  })

  it('аноним: insert получает user_id: null и user_agent из заголовка, а не из тела', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null })
    from.mockReturnValue({ insert })
    const { submitFeedbackAction } = await import('./feedback')

    const res = await submitFeedbackAction({ body: 'текст', route: '/board', user_agent: 'от клиента, не считается' })

    expect(res).toEqual({ ok: true })
    expect(from).toHaveBeenCalledWith('feedback')
    expect(insert).toHaveBeenCalledTimes(1)
    const arg = insert.mock.calls[0]?.[0] as Record<string, unknown>
    expect(arg['user_id']).toBe(null)
    expect(arg['user_agent']).toBe('vitest-agent')
    expect(arg['body']).toBe('текст')
    expect(arg['route']).toBe('/board')
  })

  it('залогиненный: user_id берётся из auth.getUser(), даже если клиент прислал чужой', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'server-user-id' } } })
    const insert = vi.fn().mockResolvedValue({ error: null })
    from.mockReturnValue({ insert })
    const { submitFeedbackAction } = await import('./feedback')

    const res = await submitFeedbackAction({ body: 'текст', user_id: 'чужой-id' })

    expect(res).toEqual({ ok: true })
    const arg = insert.mock.calls[0]?.[0] as Record<string, unknown>
    expect(arg['user_id']).toBe('server-user-id')
  })

  it('с GITHUB_REPORT_TOKEN создаёт issue и не пишет в БД', async () => {
    process.env['GITHUB_REPORT_TOKEN'] = 'test-token'
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ html_url: 'https://github.com/Drtduck/endgrain-studio/issues/1' }),
    })
    const { submitFeedbackAction } = await import('./feedback')

    const res = await submitFeedbackAction({ body: 'текст фидбека', route: '/board' })

    expect(res).toEqual({ ok: true, issueUrl: 'https://github.com/Drtduck/endgrain-studio/issues/1' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.github.com/repos/Drtduck/endgrain-studio/issues')
    expect(init.signal).toBeInstanceOf(AbortSignal)
    const body = JSON.parse(init.body as string) as { title: string; body: string; labels: string[] }
    expect(body.labels).toEqual(['feedback'])
    expect(body.title).toContain('текст фидбека')
    expect(body.body).toContain('Route: /board')
    expect(from).not.toHaveBeenCalled()
  })

  it('route с переносами строк чистится перед вставкой в title/body issue', async () => {
    process.env['GITHUB_REPORT_TOKEN'] = 'test-token'
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ html_url: 'https://github.com/Drtduck/endgrain-studio/issues/2' }),
    })
    const { submitFeedbackAction } = await import('./feedback')

    await submitFeedbackAction({ body: 'текст', route: '/board\nEvil-Header: injected\r\n/x' })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as { title: string; body: string }
    expect(body.title).not.toMatch(/[\r\n]/)
    expect(body.body).toContain('Route: /board Evil-Header: injected /x')
  })

  it('без GITHUB_REPORT_TOKEN идёт по старому пути - insert в БД', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null })
    from.mockReturnValue({ insert })
    const { submitFeedbackAction } = await import('./feedback')

    const res = await submitFeedbackAction({ body: 'текст' })

    expect(res).toEqual({ ok: true })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(from).toHaveBeenCalledWith('feedback')
  })

  it('ошибка GitHub API падает в fallback на insert в БД', async () => {
    process.env['GITHUB_REPORT_TOKEN'] = 'test-token'
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) })
    const insert = vi.fn().mockResolvedValue({ error: null })
    from.mockReturnValue({ insert })
    const { submitFeedbackAction } = await import('./feedback')

    const res = await submitFeedbackAction({ body: 'текст' })

    expect(res).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(from).toHaveBeenCalledWith('feedback')
  })

  it('сбой сети до GitHub падает в fallback на insert в БД', async () => {
    process.env['GITHUB_REPORT_TOKEN'] = 'test-token'
    fetchMock.mockRejectedValue(new Error('network down'))
    const insert = vi.fn().mockResolvedValue({ error: null })
    from.mockReturnValue({ insert })
    const { submitFeedbackAction } = await import('./feedback')

    const res = await submitFeedbackAction({ body: 'текст' })

    expect(res).toEqual({ ok: true })
    expect(from).toHaveBeenCalledWith('feedback')
  })

  it('таймаут (AbortError) до GitHub падает в fallback на insert в БД', async () => {
    process.env['GITHUB_REPORT_TOKEN'] = 'test-token'
    fetchMock.mockRejectedValue(new DOMException('The operation was aborted.', 'AbortError'))
    const insert = vi.fn().mockResolvedValue({ error: null })
    from.mockReturnValue({ insert })
    const { submitFeedbackAction } = await import('./feedback')

    const res = await submitFeedbackAction({ body: 'текст' })

    expect(res).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(from).toHaveBeenCalledWith('feedback')
  })

  it('GitHub и БД оба недоступны - error: failed', async () => {
    process.env['GITHUB_REPORT_TOKEN'] = 'test-token'
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) })
    const insert = vi.fn().mockResolvedValue({ error: { message: 'db down' } })
    from.mockReturnValue({ insert })
    const { submitFeedbackAction } = await import('./feedback')

    const res = await submitFeedbackAction({ body: 'текст' })

    expect(res).toEqual({ ok: false, error: 'failed' })
  })

  it('GITHUB_REPORT_TOKEN задан, Supabase не настроен, GitHub ответил ошибкой - disabled', async () => {
    process.env['GITHUB_REPORT_TOKEN'] = 'test-token'
    configured = false
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) })
    const { submitFeedbackAction } = await import('./feedback')

    const res = await submitFeedbackAction({ body: 'текст' })

    expect(res).toEqual({ ok: false, error: 'disabled' })
  })

  it('вложение уезжает в bucket, а в тело issue идёт signed URL', async () => {
    process.env['GITHUB_REPORT_TOKEN'] = 'test-token'
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ html_url: 'https://github.com/Drtduck/endgrain-studio/issues/7' }),
    })
    getUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'a@b.c' } } })
    const { submitFeedbackAction } = await import('./feedback')

    const res = await submitFeedbackAction({
      body: 'текст',
      attachment: { name: 'скрин доски.png', type: 'image/png', dataBase64: 'AAAA' },
    })

    expect(res.ok).toBe(true)
    expect(storageFrom).toHaveBeenCalledWith('feedback-attachments')
    expect(upload).toHaveBeenCalledTimes(1)
    const [path, bytes, opts] = upload.mock.calls[0] as [string, Buffer, { contentType: string }]
    // Кириллица и пробелы в имени схлопываются, путь начинается с id автора.
    expect(path.startsWith('user-1/')).toBe(true)
    expect(path.endsWith('-attachment-_.png')).toBe(true)
    expect(Buffer.isBuffer(bytes)).toBe(true)
    expect(opts.contentType).toBe('image/png')

    const body = issueBodyFromFetch(fetchMock)
    expect(body).toContain('### Вложения')
    expect(body).toContain('https://storage/signed')
  })

  it('скриншот грузится отдельным объектом с типом image/jpeg', async () => {
    process.env['GITHUB_REPORT_TOKEN'] = 'test-token'
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ html_url: 'https://github.com/Drtduck/endgrain-studio/issues/8' }),
    })
    const { submitFeedbackAction } = await import('./feedback')

    await submitFeedbackAction({ body: 'текст', screenshot: { dataBase64: 'BBBB' } })

    expect(upload).toHaveBeenCalledTimes(1)
    const [path, , opts] = upload.mock.calls[0] as [string, Buffer, { contentType: string }]
    expect(path.startsWith('anon/')).toBe(true)
    expect(path.endsWith('-screenshot.jpg')).toBe(true)
    expect(opts.contentType).toBe('image/jpeg')
    expect(issueBodyFromFetch(fetchMock)).toContain('Скриншот экрана')
  })

  it('без service-ключа вложение не грузится, но issue создаётся с пометкой', async () => {
    process.env['GITHUB_REPORT_TOKEN'] = 'test-token'
    serviceConfigured = false
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ html_url: 'https://github.com/Drtduck/endgrain-studio/issues/9' }),
    })
    const { submitFeedbackAction } = await import('./feedback')

    const res = await submitFeedbackAction({
      body: 'текст',
      attachment: { name: 'a.png', type: 'image/png', dataBase64: 'AAAA' },
    })

    expect(res.ok).toBe(true)
    expect(upload).not.toHaveBeenCalled()
    expect(issueBodyFromFetch(fetchMock)).toContain('сохранить его в Storage не удалось')
  })

  it('ошибка upload не роняет отправку, issue уходит без ссылки на файл', async () => {
    process.env['GITHUB_REPORT_TOKEN'] = 'test-token'
    upload.mockResolvedValue({ error: { message: 'bucket not found' } })
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ html_url: 'https://github.com/Drtduck/endgrain-studio/issues/10' }),
    })
    const { submitFeedbackAction } = await import('./feedback')

    const res = await submitFeedbackAction({
      body: 'текст',
      attachment: { name: 'a.png', type: 'image/png', dataBase64: 'AAAA' },
    })

    expect(res.ok).toBe(true)
    expect(createSignedUrl).not.toHaveBeenCalled()
    expect(issueBodyFromFetch(fetchMock)).toContain('сохранить его в Storage не удалось')
  })

  it('fallback в БД пишет signed URL и очищенное имя файла', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null })
    from.mockReturnValue({ insert })
    const { submitFeedbackAction } = await import('./feedback')

    const res = await submitFeedbackAction({
      body: 'текст',
      attachment: { name: 'мой файл.png', type: 'image/png', dataBase64: 'AAAA' },
      screenshot: { dataBase64: 'BBBB' },
    })

    expect(res).toEqual({ ok: true })
    const arg = insert.mock.calls[0]?.[0] as Record<string, unknown>
    expect(arg['attachment_url']).toBe('https://storage/signed')
    expect(arg['screenshot_url']).toBe('https://storage/signed')
    expect(arg['attachment_name']).toBe('_.png')
  })

  it('вложение сверх лимита base64 даёт attachmentTooBig и никуда не грузится', async () => {
    const { submitFeedbackAction } = await import('./feedback')

    const res = await submitFeedbackAction({
      body: 'текст',
      attachment: {
        name: 'big.png',
        type: 'image/png',
        dataBase64: 'a'.repeat(FEEDBACK_ATTACHMENT_B64_MAX + 1),
      },
    })

    expect(res).toEqual({ ok: false, error: 'attachmentTooBig' })
    expect(upload).not.toHaveBeenCalled()
    expect(from).not.toHaveBeenCalled()
  })

  it('скриншот сверх лимита base64 даёт attachmentTooBig', async () => {
    const { submitFeedbackAction } = await import('./feedback')

    const res = await submitFeedbackAction({
      body: 'текст',
      screenshot: { dataBase64: 'a'.repeat(FEEDBACK_SCREENSHOT_B64_MAX + 1) },
    })

    expect(res).toEqual({ ok: false, error: 'attachmentTooBig' })
    expect(upload).not.toHaveBeenCalled()
  })

  it('лог действий и viewport попадают в тело issue с почищенными переносами', async () => {
    process.env['GITHUB_REPORT_TOKEN'] = 'test-token'
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ html_url: 'https://github.com/Drtduck/endgrain-studio/issues/11' }),
    })
    const { submitFeedbackAction } = await import('./feedback')

    await submitFeedbackAction({
      body: 'текст',
      viewport: '1512x824',
      url: 'https://app.example/board',
      actions: [{ t: '2026-08-12T10:00:00.000Z', kind: 'click', label: 'Экспорт\nEvil: injected' }],
    })

    const body = issueBodyFromFetch(fetchMock)
    expect(body).toContain('Viewport: 1512x824')
    expect(body).toContain('URL: https://app.example/board')
    expect(body).toContain('### Последние действия')
    expect(body).toContain('клик: Экспорт Evil: injected')
  })
})

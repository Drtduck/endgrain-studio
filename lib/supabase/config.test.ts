import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('isSupabaseConfigured', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('возвращает false, когда обе переменные пусты', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')
    vi.resetModules()
    const { isSupabaseConfigured } = await import('./config')
    expect(isSupabaseConfigured()).toBe(false)
  })

  it('возвращает false, когда задана только одна переменная', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')
    vi.resetModules()
    const { isSupabaseConfigured } = await import('./config')
    expect(isSupabaseConfigured()).toBe(false)
  })

  it('возвращает true, когда заданы обе переменные', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key')
    vi.resetModules()
    const { isSupabaseConfigured } = await import('./config')
    expect(isSupabaseConfigured()).toBe(true)
  })
})

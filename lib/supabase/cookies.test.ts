import { describe, it, expect } from 'vitest'
import { supabaseCookieOptions } from './cookies'

describe('supabaseCookieOptions', () => {
  it('на боевом хосте даёт общий для лендинга и студии домен', () => {
    const options = supabaseCookieOptions('app.endgrain.app')
    expect(options.name).toBe('sb-egs-auth')
    expect(options.domain).toBe('.endgrain.app')
    expect(options.secure).toBe(true)
    expect(options.path).toBe('/')
    expect(options.sameSite).toBe('lax')
  })

  it('лендинг и студия получают одинаковые опции', () => {
    // Разъехавшись, они дадут две cookie с одним именем, и вход начнёт срабатывать через раз.
    expect(supabaseCookieOptions('endgrain.app')).toEqual(supabaseCookieOptions('app.endgrain.app'))
  })

  it('на localhost домен не ставится и cookie не помечается secure', () => {
    const options = supabaseCookieOptions('localhost:3000')
    expect(options.domain).toBeUndefined()
    expect('domain' in options).toBe(false)
    expect(options.secure).toBe(false)
    expect(options.name).toBe('sb-egs-auth')
  })

  it('на 127.0.0.1 из e2e домена тоже нет', () => {
    expect(supabaseCookieOptions('127.0.0.1:3100').domain).toBeUndefined()
    expect(supabaseCookieOptions('127.0.0.1:3100').secure).toBe(false)
  })

  it('на превью vercel.app cookie host-only, но secure: там https', () => {
    const options = supabaseCookieOptions('endgrain-studio-abc123.vercel.app')
    expect(options.domain).toBeUndefined()
    expect(options.secure).toBe(true)
  })

  it('без заголовка Host остаётся host-only cookie без secure', () => {
    expect(supabaseCookieOptions(null).domain).toBeUndefined()
    expect(supabaseCookieOptions(null).secure).toBe(false)
  })
})

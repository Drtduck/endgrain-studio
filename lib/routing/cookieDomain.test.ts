import { describe, it, expect } from 'vitest'
import { isSecureCookieHost, registrableCookieDomain } from './cookieDomain'

describe('registrableCookieDomain', () => {
  it('лендинг и приложение сводятся к одному домену', () => {
    expect(registrableCookieDomain('https://endgrain.app')).toBe('.endgrain.app')
    expect(registrableCookieDomain('https://app.endgrain.app')).toBe('.endgrain.app')
  })

  it('заголовок Host даёт тот же домен, что и origin', () => {
    // Ровно этот вход приходит с сервера и из proxy: там полного origin нет.
    expect(registrableCookieDomain('app.endgrain.app')).toBe('.endgrain.app')
    expect(registrableCookieDomain('APP.ENDGRAIN.APP:443')).toBe('.endgrain.app')
    expect(registrableCookieDomain('endgrain.app')).toBe(registrableCookieDomain('https://endgrain.app'))
  })

  it('www и глубокий поддомен дают тот же регистрируемый домен', () => {
    expect(registrableCookieDomain('https://www.endgrain.app')).toBe('.endgrain.app')
    expect(registrableCookieDomain('https://preview.app.endgrain.app')).toBe('.endgrain.app')
  })

  it('двухуровневый публичный суффикс не съедает домен человека', () => {
    expect(registrableCookieDomain('https://app.example.co.uk')).toBe('.example.co.uk')
    expect(registrableCookieDomain('https://example.co.uk')).toBe('.example.co.uk')
  })

  it('на localhost и IP домен не ставится', () => {
    expect(registrableCookieDomain('http://localhost:3000')).toBeUndefined()
    expect(registrableCookieDomain('localhost:3000')).toBeUndefined()
    expect(registrableCookieDomain('http://127.0.0.1:3100')).toBeUndefined()
    expect(registrableCookieDomain('127.0.0.1:3100')).toBeUndefined()
    expect(registrableCookieDomain('[::1]:3100')).toBeUndefined()
  })

  it('на превью-деплое vercel.app домен не ставится', () => {
    expect(registrableCookieDomain('https://x.vercel.app')).toBeUndefined()
    expect(registrableCookieDomain('endgrain-studio-abc123.vercel.app')).toBeUndefined()
  })

  it('мусорный origin не роняет вызов', () => {
    expect(registrableCookieDomain('не-ссылка')).toBeUndefined()
    expect(registrableCookieDomain('')).toBeUndefined()
  })
})

describe('isSecureCookieHost', () => {
  it('на боевом и превью-хосте secure ставится', () => {
    expect(isSecureCookieHost('app.endgrain.app')).toBe(true)
    expect(isSecureCookieHost('https://endgrain.app')).toBe(true)
    expect(isSecureCookieHost('endgrain-studio-abc123.vercel.app')).toBe(true)
  })

  it('на локальном хосте secure убил бы cookie, поэтому его нет', () => {
    expect(isSecureCookieHost('localhost:3000')).toBe(false)
    expect(isSecureCookieHost('127.0.0.1:3100')).toBe(false)
    expect(isSecureCookieHost('[::1]:3100')).toBe(false)
  })
})

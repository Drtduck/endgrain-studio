import { describe, it, expect } from 'vitest'
import { localeCookieDomain } from './localeCookie'

describe('localeCookieDomain', () => {
  it('для боевого apex отдаёт домен с точкой спереди', () => {
    expect(localeCookieDomain('https://endgrain.app')).toBe('.endgrain.app')
  })

  it('www сводит к тому же apex', () => {
    expect(localeCookieDomain('https://www.endgrain.app')).toBe('.endgrain.app')
  })

  it('поддомен приложения даёт тот же регистрируемый домен, что и лендинг', () => {
    // Отсюда функция и зовётся на клиенте: cookie должна быть видна и на endgrain.app.
    expect(localeCookieDomain('https://app.endgrain.app')).toBe('.endgrain.app')
    expect(localeCookieDomain('https://app.endgrain.app')).toBe(localeCookieDomain('https://endgrain.app'))
  })

  it('глубокий поддомен тоже сводится к регистрируемому домену', () => {
    expect(localeCookieDomain('https://preview.app.endgrain.app')).toBe('.endgrain.app')
  })

  it('двухуровневый публичный суффикс не съедает домен человека', () => {
    expect(localeCookieDomain('https://app.endgrain.co.uk')).toBe('.endgrain.co.uk')
    expect(localeCookieDomain('https://endgrain.co.uk')).toBe('.endgrain.co.uk')
  })

  it('на localhost и IP домен не ставится', () => {
    expect(localeCookieDomain('http://localhost:3000')).toBeUndefined()
    expect(localeCookieDomain('http://127.0.0.1:3100')).toBeUndefined()
  })

  it('на превью-деплое vercel.app домен не ставится', () => {
    expect(localeCookieDomain('https://endgrain-studio-abc123.vercel.app')).toBeUndefined()
  })

  it('мусорный origin не роняет вызов', () => {
    expect(localeCookieDomain('не-ссылка')).toBeUndefined()
  })
})

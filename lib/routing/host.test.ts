// Хост подменяется явно: на дефолтном jsdom-хосте проверка «остаётся на текущем origin»
// сравнивала бы значение само с собой.
// @vitest-environment-options { "url": "http://localhost:3100/" }
import { describe, expect, it } from 'vitest'
import { APP_ORIGIN, appOriginForClient, hostRole } from './host'

describe('hostRole', () => {
  it('распознаёт корневой домен сайта', () => {
    expect(hostRole('endgrain.app')).toBe('site')
  })

  it('игнорирует регистр и порт', () => {
    expect(hostRole('ENDGRAIN.APP:443')).toBe('site')
  })

  it('распознаёт www как сайт', () => {
    expect(hostRole('www.endgrain.app')).toBe('site')
  })

  it('распознаёт поддомен студии', () => {
    expect(hostRole('app.endgrain.app')).toBe('app')
  })

  it('локальный хост с портом остаётся unknown', () => {
    expect(hostRole('127.0.0.1:3100')).toBe('unknown')
  })

  it('превью-домен vercel остаётся unknown', () => {
    expect(hostRole('endgrain-studio.vercel.app')).toBe('unknown')
  })

  it('отсутствие заголовка Host остаётся unknown', () => {
    expect(hostRole(null)).toBe('unknown')
  })

  it('подделка домена не проходит: сравнение точное, а не endsWith', () => {
    expect(hostRole('evil-endgrain.app')).toBe('unknown')
  })
})

describe('appOriginForClient', () => {
  it('на незнакомом хосте остаётся на текущем origin, а не уводит на прод', () => {
    expect(window.location.origin).toBe('http://localhost:3100')
    expect(appOriginForClient()).toBe('http://localhost:3100')
    expect(appOriginForClient()).not.toBe(APP_ORIGIN)
  })
})

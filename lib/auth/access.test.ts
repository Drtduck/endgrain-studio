import { describe, expect, it } from 'vitest'
import {
  decideAccess,
  isAuthEntryPath,
  isPublicPath,
  loginRedirectPath,
  safeNextPath,
  type AccessInput,
} from './access'

/** База: студия, аноним, Supabase настроен, аварийный флаг выключен. */
function input(overrides: Partial<AccessInput> = {}): AccessInput {
  return {
    role: 'app',
    pathname: '/',
    search: '',
    authenticated: false,
    publicStudio: false,
    supabaseConfigured: true,
    ...overrides,
  }
}

describe('isPublicPath', () => {
  it.each([
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password',
    '/auth/callback',
    '/pricing',
    '/landing',
    '/landing/opengraph-image',
    '/blog',
    '/blog/kerf-i-pripuski',
    '/legal/privacy',
    '/legal/personal-data',
    '/legal/consent',
    '/api/stripe/webhook',
    '/robots.txt',
    '/sitemap.xml',
    '/llms.txt',
    '/favicon.ico',
    '/apple-icon.png',
    '/brand/beaver-logo.svg',
    '/_next/static/chunk.js',
  ])('открыт без аккаунта: %s', (path) => {
    expect(isPublicPath(path)).toBe(true)
  })

  it.each(['/', '/?tab=projects', '/projects', '/loginx', '/landingx'])(
    'требует аккаунта: %s',
    (path) => {
      expect(isPublicPath(path)).toBe(false)
    }
  )

  it('открывает картинки соцсетей с хешем в имени', () => {
    expect(isPublicPath('/opengraph-image-a1b2c3')).toBe(true)
  })
})

describe('isAuthEntryPath', () => {
  it.each(['/login', '/register'])('вход/регистрация: %s', (path) => {
    expect(isAuthEntryPath(path)).toBe(true)
  })

  it.each(['/forgot-password', '/reset-password', '/loginx', '/'])(
    'не вход: %s',
    (path) => {
      expect(isAuthEntryPath(path)).toBe(false)
    }
  )
})

describe('safeNextPath', () => {
  it('пропускает относительный путь с query', () => {
    expect(safeNextPath('/?tab=cut')).toBe('/?tab=cut')
  })

  const BAD_NEXT: readonly (string | null | undefined)[] = [
    '//evil.com', // протокол-относительный адрес: браузер уйдёт на чужой домен
    'https://evil.com', // абсолютный адрес со схемой
    '/\\evil.com', // обратный слеш вместо второго прямого
    'evil.com', // путь без ведущего слеша
    '',
    null,
    undefined,
  ]

  it.each(BAD_NEXT)('валит в корень чужой или битый next: %s', (raw) => {
    expect(safeNextPath(raw)).toBe('/')
  })

  it('режет управляющие символы: подделка заголовка Location недопустима', () => {
    expect(safeNextPath('/ok\r\nSet-Cookie: a=b')).toBe('/')
  })

  it('уважает собственный fallback', () => {
    expect(safeNextPath('//evil.com', '/login')).toBe('/login')
  })
})

describe('loginRedirectPath', () => {
  it('кладёт исходный путь с query в next', () => {
    expect(loginRedirectPath('/', '?tab=projects')).toBe('/login?next=%2F%3Ftab%3Dprojects')
  })

  it('для голого корня next не добавляет: возвращать некуда', () => {
    expect(loginRedirectPath('/', '')).toBe('/login')
  })
})

describe('decideAccess', () => {
  it('анонима на закрытом пути уводит на логин с возвратом', () => {
    expect(decideAccess(input({ pathname: '/', search: '?tab=cut' }))).toEqual({
      kind: 'redirect',
      to: '/login?next=%2F%3Ftab%3Dcut',
    })
  })

  it('авторизованного пускает', () => {
    expect(decideAccess(input({ authenticated: true })).kind).toBe('allow')
  })

  it('публичный путь открыт и анониму', () => {
    expect(decideAccess(input({ pathname: '/login' })).kind).toBe('allow')
  })

  it('лендинг остаётся публичным целиком', () => {
    expect(decideAccess(input({ role: 'site', pathname: '/' })).kind).toBe('allow')
  })

  it('превью и localhost (unknown) закрыты так же, как студия', () => {
    expect(decideAccess(input({ role: 'unknown' })).kind).toBe('redirect')
  })

  it('PUBLIC_STUDIO=1 возвращает открытый доступ', () => {
    expect(decideAccess(input({ publicStudio: true })).kind).toBe('allow')
  })

  it('без ключей Supabase гейт выключен: логиниться всё равно негде', () => {
    expect(decideAccess(input({ supabaseConfigured: false })).kind).toBe('allow')
  })

  it('авторизованного на /login уводит в корень студии', () => {
    expect(decideAccess(input({ authenticated: true, pathname: '/login' }))).toEqual({
      kind: 'redirect',
      to: '/',
    })
  })

  it('авторизованного на /login с next возвращает по next', () => {
    expect(
      decideAccess(
        input({ authenticated: true, pathname: '/login', search: '?next=' + encodeURIComponent('/?tab=cut') })
      )
    ).toEqual({ kind: 'redirect', to: '/?tab=cut' })
  })

  it('авторизованного на /register уводит в корень студии', () => {
    expect(decideAccess(input({ authenticated: true, pathname: '/register' }))).toEqual({
      kind: 'redirect',
      to: '/',
    })
  })

  it('next, указывающий на /login, тоже уводит в корень: возвращаться некуда', () => {
    expect(
      decideAccess(input({ authenticated: true, pathname: '/login', search: '?next=%2Flogin' }))
    ).toEqual({ kind: 'redirect', to: '/' })
  })

  it('открытый редирект в next режется safeNextPath и уводит в корень', () => {
    expect(
      decideAccess(
        input({ authenticated: true, pathname: '/login', search: '?next=' + encodeURIComponent('//evil.com') })
      )
    ).toEqual({ kind: 'redirect', to: '/' })
  })

  it('PUBLIC_STUDIO=1 не отменяет уход авторизованного со страницы входа', () => {
    expect(
      decideAccess(input({ authenticated: true, publicStudio: true, pathname: '/login' }))
    ).toEqual({ kind: 'redirect', to: '/' })
  })

  it('регресс: аноним на /login остаётся на форме', () => {
    expect(decideAccess(input({ pathname: '/login' })).kind).toBe('allow')
  })

  it('регресс: авторизованный на /reset-password не уводится - recovery-сессия обязана дойти до формы', () => {
    expect(decideAccess(input({ authenticated: true, pathname: '/reset-password' })).kind).toBe('allow')
  })
})

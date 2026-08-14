import { describe, expect, it } from 'vitest'
import { AVATAR_URL_MAX, avatarObjectPath, avatarPublicUrl, isOwnAvatarUrl } from './avatar'

const SUPABASE = 'https://abcdefgh.supabase.co'
const USER = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'

describe('lib/profile/avatar: путь и публичная ссылка', () => {
  it('путь объекта лежит в папке пользователя', () => {
    expect(avatarObjectPath(USER)).toBe(`${USER}/avatar.png`)
  })

  it('публичная ссылка собирается по адресу Storage, версия уходит в query', () => {
    const path = avatarObjectPath(USER)
    expect(avatarPublicUrl(SUPABASE, path)).toBe(`${SUPABASE}/storage/v1/object/public/avatars/${path}`)
    expect(avatarPublicUrl(`${SUPABASE}/`, path, 42)).toBe(`${SUPABASE}/storage/v1/object/public/avatars/${path}?v=42`)
  })
})

describe('lib/profile/avatar: isOwnAvatarUrl', () => {
  it('своя папка своего bucket проходит, в том числе с query-версией', () => {
    const url = avatarPublicUrl(SUPABASE, avatarObjectPath(USER))
    expect(isOwnAvatarUrl(url, USER, SUPABASE)).toBe(true)
    expect(isOwnAvatarUrl(`${url}?v=1700000000000`, USER, SUPABASE)).toBe(true)
  })

  it('чужая папка того же bucket не проходит', () => {
    const foreign = avatarPublicUrl(SUPABASE, avatarObjectPath(OTHER))
    expect(isOwnAvatarUrl(foreign, USER, SUPABASE)).toBe(false)
  })

  it('чужой хост не проходит, даже если путь выглядит как наш', () => {
    const evil = `https://evil.example.com/storage/v1/object/public/avatars/${USER}/avatar.png`
    expect(isOwnAvatarUrl(evil, USER, SUPABASE)).toBe(false)
  })

  it('чужой bucket и приватный путь того же хоста не проходят', () => {
    expect(isOwnAvatarUrl(`${SUPABASE}/storage/v1/object/public/promo-mockups/${USER}/a.png`, USER, SUPABASE)).toBe(false)
    expect(isOwnAvatarUrl(`${SUPABASE}/storage/v1/object/sign/avatars/${USER}/avatar.png`, USER, SUPABASE)).toBe(false)
  })

  it('схемы javascript: и data: не проходят', () => {
    expect(isOwnAvatarUrl('javascript:alert(1)', USER, SUPABASE)).toBe(false)
    expect(isOwnAvatarUrl('data:image/png;base64,iVBORw0KGgo=', USER, SUPABASE)).toBe(false)
    expect(isOwnAvatarUrl(`http://abcdefgh.supabase.co/storage/v1/object/public/avatars/${USER}/a.png`, USER, SUPABASE)).toBe(false)
  })

  it('относительный путь проходит, протокол-относительный - нет', () => {
    expect(isOwnAvatarUrl('/brand/beaver-mark.png', USER, SUPABASE)).toBe(true)
    expect(isOwnAvatarUrl('//evil.example.com/a.png', USER, SUPABASE)).toBe(false)
    expect(isOwnAvatarUrl('/../../etc/passwd', USER, SUPABASE)).toBe(false)
  })

  it('пустая строка, слишком длинная ссылка и пробелы внутри не проходят', () => {
    expect(isOwnAvatarUrl('', USER, SUPABASE)).toBe(false)
    expect(isOwnAvatarUrl(`/a${'b'.repeat(AVATAR_URL_MAX)}`, USER, SUPABASE)).toBe(false)
    expect(isOwnAvatarUrl('/brand/beaver mark.png', USER, SUPABASE)).toBe(false)
  })

  it('без известного адреса Supabase абсолютная ссылка не проходит вовсе', () => {
    expect(isOwnAvatarUrl(avatarPublicUrl(SUPABASE, avatarObjectPath(USER)), USER, '')).toBe(false)
  })
})

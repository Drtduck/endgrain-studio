/**
 * Формат и криптография API-ключей. Чистые функции без Supabase: покрываются
 * vitest целиком, без единого мока. Web Crypto (`crypto.subtle`, `crypto.getRandomValues`),
 * а не `node:crypto`: роуты, которые их используют, должны уметь жить и на edge,
 * если приложение туда однажды переедет.
 *
 * Полный ключ: `egs_<live|test>_<8 символов>_<43 символа секрета>`.
 * Видимая часть (всё до второго подчёркивания включительно восьми символов
 * префикса) хранится в колонке `prefix` таблицы `api_keys` открытым текстом
 * и по ней ищется строка при проверке запроса. Секрет хранится только как
 * sha256-хеш: восстановить ключ из базы невозможно by design.
 */

/** База символов префикса: та же строка ровно продублирована в SQL-констрейнте
 *  `api_keys_prefix_fmt` и в тесте, чтобы расхождение кода и миграции стало заметно сразу. */
const PREFIX_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'
const PREFIX_SUFFIX_LEN = 8
const SECRET_BYTES = 32

export type ApiKeyEnv = 'live' | 'test'

export interface GeneratedApiKey {
  /** Полный ключ, показывается пользователю ровно один раз. */
  readonly plaintext: string
  /** Видимая часть, уходит в колонку `prefix`. */
  readonly prefix: string
  /** sha256(plaintext) в hex нижнего регистра, уходит в колонку `key_hash`. */
  readonly hash: string
}

/** Ровно та же форма, что констрейнт `api_keys_prefix_fmt` в миграции. */
export const PREFIX_PATTERN = /^egs_(live|test)_[0-9a-z]{8}$/
/** Ровно та же форма, что констрейнт `api_keys_hash_fmt` в миграции. */
export const HASH_PATTERN = /^[0-9a-f]{64}$/

function randomPrefixSuffix(): string {
  const bytes = new Uint8Array(PREFIX_SUFFIX_LEN)
  crypto.getRandomValues(bytes)
  let out = ''
  for (const b of bytes) out += PREFIX_ALPHABET[b % PREFIX_ALPHABET.length]
  return out
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  const base64 = btoa(binary)
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** sha256 полного ключа, hex в нижнем регистре. */
export async function hashApiKey(plaintext: string): Promise<string> {
  const data = new TextEncoder().encode(plaintext)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return bytesToHex(digest)
}

/** Генерирует новый ключ. Коллизия префикса ловится вызывающим кодом по ошибке уникальности индекса. */
export async function generateApiKey(env: ApiKeyEnv): Promise<GeneratedApiKey> {
  const prefix = `egs_${env}_${randomPrefixSuffix()}`
  const secretBytes = new Uint8Array(SECRET_BYTES)
  crypto.getRandomValues(secretBytes)
  const secret = bytesToBase64Url(secretBytes)
  const plaintext = `${prefix}_${secret}`
  const hash = await hashApiKey(plaintext)
  return { plaintext, prefix, hash }
}

export interface ParsedApiKey {
  readonly prefix: string
  readonly plaintext: string
}

/**
 * Разбирает сырой ключ из заголовка Authorization. Ничего не бросает: мусорный
 * вход это `null`, не исключение, потому что вызывающий код (lib/api/auth.ts)
 * обязан отвечать одинаковым 401 и на отсутствие ключа, и на мусор вместо него.
 */
export function parseApiKey(raw: string): ParsedApiKey | null {
  const match = /^(egs_(?:live|test)_[0-9a-z]{8})_([A-Za-z0-9_-]{43})$/.exec(raw)
  if (!match) return null
  const [, prefix, secret] = match
  if (!prefix || !secret) return null
  return { prefix, plaintext: raw }
}

/**
 * Постоянное по времени сравнение двух hex-строк. `crypto.timingSafeEqual` из
 * `node:crypto` тут не берём по той же причине, что и в остальном модуле:
 * код должен уметь жить и вне Node-рантайма.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

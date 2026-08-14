import { describe, expect, it } from 'vitest'
import { extractFunctionBody, readMigration } from './migrationSql'

describe('20260814150000_subscriptions_product.sql: composite key и set_api_tier', () => {
  const sql = readMigration('20260814150000_subscriptions_product.sql')

  it('product ограничен pro/api с дефолтом pro', () => {
    expect(sql).toMatch(/add column if not exists product text not null default 'pro'/)
    expect(sql).toMatch(/check \(product in \('pro', 'api'\)\)/)
  })

  it('первичный ключ становится составным (user_id, product)', () => {
    expect(sql).toMatch(/drop constraint if exists subscriptions_pkey/)
    expect(sql).toMatch(/add primary key \(user_id, product\)/)
  })

  it('constraint product_allowed идемпотентен: drop if exists перед повторным add', () => {
    const dropIdx = sql.indexOf('drop constraint if exists subscriptions_product_allowed')
    const addIdx = sql.indexOf("add constraint subscriptions_product_allowed check (product in ('pro', 'api'))")
    expect(dropIdx, 'drop constraint if exists должен присутствовать').toBeGreaterThan(-1)
    expect(addIdx, 'add constraint должен присутствовать').toBeGreaterThan(-1)
    expect(dropIdx).toBeLessThan(addIdx)
  })

  it('set_api_tier обновляет только неотозванные ключи пользователя', () => {
    const body = extractFunctionBody(sql, 'set_api_tier')
    expect(body).toMatch(/where user_id = p_user_id\s+and revoked_at is null/)
  })

  it('set_api_tier отбивает неизвестный тир, ничего не обновляя', () => {
    const body = extractFunctionBody(sql, 'set_api_tier')
    expect(body).toMatch(/if p_tier not in \('free', 'developer'\) then/)
    const guardIdx = body.indexOf("if p_tier not in")
    const updateIdx = body.indexOf('update public.api_keys')
    expect(guardIdx).toBeGreaterThan(-1)
    expect(guardIdx).toBeLessThan(updateIdx)
  })

  it('исполнение функции доступно только service_role', () => {
    expect(sql).toMatch(/revoke all on function public\.set_api_tier\(uuid, text\) from public, anon, authenticated/)
    expect(sql).toMatch(/grant execute on function public\.set_api_tier\(uuid, text\) to service_role/)
  })
})

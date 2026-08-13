import { describe, expect, it } from 'vitest'
import { readMigration } from './migrationSql'

describe('20260813120000_agent_api_keys.sql: consume_api_quota и column-grant', () => {
  const sql = readMigration('20260813120000_agent_api_keys.sql')

  it('лимит считается суммой used по user_id и day, а не по одному key_id', () => {
    const start = sql.indexOf('create or replace function public.consume_api_quota(')
    const end = sql.indexOf('\n$$;', start)
    const body = sql.slice(start, end)
    expect(body).toMatch(/sum\(used\)/)
    expect(body).toMatch(/where user_id = p_user_id and day = p_day/)
    // Проверка потолка обязана идти до insert/update, иначе списание уже
    // случится раньше отказа.
    const checkIdx = body.indexOf('v_total_before + p_cost > p_limit')
    const insertIdx = body.indexOf('insert into public.api_usage')
    expect(checkIdx).toBeGreaterThan(-1)
    expect(checkIdx).toBeLessThan(insertIdx)
  })

  it('api_keys_delete_own больше не создаётся: строку из браузера удалить нельзя', () => {
    expect(sql).not.toMatch(/create policy api_keys_delete_own/)
  })

  it('select на api_keys - полный revoke с таблицы плюс явный список колонок без key_hash', () => {
    expect(sql).toMatch(/revoke select on public\.api_keys from authenticated/)
    const grantMatch = /grant select \(([^)]+)\) on public\.api_keys to authenticated/.exec(sql)
    expect(grantMatch, 'явный column-grant на api_keys должен существовать').not.toBeNull()
    expect(grantMatch?.[1]).not.toMatch(/key_hash/)
  })
})

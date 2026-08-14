import { describe, expect, it } from 'vitest'
import { extractFunctionBody, readMigration } from './migrationSql'

describe('20260814160000_pro_passes.sql: grant_pro_pass идемпотентен и продлевает', () => {
  const sql = readMigration('20260814160000_pro_passes.sql')

  it('stripe_session_id уникален: повторная доставка события не должна плодить строки', () => {
    expect(sql).toMatch(/stripe_session_id text not null unique/)
  })

  it('только select-политика своей строки, записи из браузера нет', () => {
    expect(sql).toMatch(/create policy pro_passes_select_own/)
    expect(sql).not.toMatch(/create policy pro_passes_insert/)
    expect(sql).not.toMatch(/create policy pro_passes_update/)
  })

  it('продление берёт greatest(now(), максимум expires_at пользователя)', () => {
    const body = extractFunctionBody(sql, 'grant_pro_pass')
    expect(body).toMatch(/greatest\(now\(\), coalesce\(max\(expires_at\), now\(\)\)\)/)
    expect(body).toMatch(/where user_id = p_user_id/)
  })

  it('повтор с тем же ref ловится unique_violation и не создаёт вторую строку', () => {
    const body = extractFunctionBody(sql, 'grant_pro_pass')
    expect(body).toMatch(/exception\s+when\s+unique_violation\s+then/)
    const exceptionBlock = body.slice(body.indexOf('exception'))
    expect(exceptionBlock).toMatch(/select expires_at into v_expires/)
    expect(exceptionBlock).not.toMatch(/insert into public\.pro_passes/)
  })

  it('нулевое или отрицательное число дней отбивается без записи', () => {
    const body = extractFunctionBody(sql, 'grant_pro_pass')
    expect(body).toMatch(/if p_days is null or p_days <= 0 then/)
    const guardIdx = body.indexOf('if p_days is null')
    const insertIdx = body.indexOf('insert into public.pro_passes')
    expect(guardIdx).toBeGreaterThan(-1)
    expect(guardIdx).toBeLessThan(insertIdx)
  })

  it('исполнение функции доступно только service_role', () => {
    expect(sql).toMatch(/revoke all on function public\.grant_pro_pass\(uuid, text, int\) from public, anon, authenticated/)
    expect(sql).toMatch(/grant execute on function public\.grant_pro_pass\(uuid, text, int\) to service_role/)
  })
})

import { describe, expect, it } from 'vitest'
import { readMigration } from './migrationSql'

describe("20260813100000_gallery.sql: design закрыт column-grant'ом", () => {
  const sql = readMigration('20260813100000_gallery.sql')

  it('select на published_projects - полный revoke плюс явный список колонок без design', () => {
    expect(sql).toMatch(/revoke select on public\.published_projects from anon, authenticated/)
    const grantMatch = /grant select \(([\s\S]*?)\) on public\.published_projects to anon, authenticated/.exec(sql)
    expect(grantMatch, 'явный column-grant на published_projects должен существовать').not.toBeNull()
    expect(grantMatch?.[1]).not.toMatch(/\bdesign\b/)
  })

  it('published_project_design отдаёт design только бесплатным, автору и купившим - функция security definer', () => {
    const start = sql.indexOf('create or replace function public.published_project_design(')
    expect(start).toBeGreaterThan(-1)
    const end = sql.indexOf('\n$$;', start)
    const body = sql.slice(start, end)
    expect(body).toMatch(/security definer/)
    expect(body).toMatch(/v_price = 0 or v_author = v_uid/)
    expect(body).toMatch(/project_purchases/)
  })
})

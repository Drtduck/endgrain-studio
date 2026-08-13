import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Тесты-структура по тексту SQL-миграций. Живой Postgres в vitest не поднять,
 * но порядок операторов внутри security definer функций - это ровно то, что
 * определяет идемпотентность и корректность лимитов, и его можно проверить
 * регулярными выражениями по исходнику. Миграции ещё не применены к удалённой
 * базе (см. CLAUDE.md), поэтому это единственная автоматическая проверка,
 * которая у них сейчас есть.
 */
const MIGRATIONS_DIR = join(__dirname, '..', '..', 'supabase', 'migrations')

function readMigration(name: string): string {
  return readFileSync(join(MIGRATIONS_DIR, name), 'utf8')
}

describe('20260813110000_wallet.sql: wallet_spend идемпотентен по ref', () => {
  const sql = readMigration('20260813110000_wallet.sql')

  function extractFunctionBody(name: string): string {
    const start = sql.indexOf(`create or replace function public.${name}(`)
    expect(start, `функция ${name} должна существовать в миграции`).toBeGreaterThan(-1)
    const end = sql.indexOf('\n$$;', start)
    expect(end, `конец тела функции ${name} (маркер $$;) должен найтись`).toBeGreaterThan(-1)
    return sql.slice(start, end)
  }

  it('insert в wallet_transactions идёт раньше update баланса в wallets', () => {
    const body = extractFunctionBody('wallet_spend')
    const insertIdx = body.indexOf('insert into public.wallet_transactions')
    const updateIdx = body.indexOf('update public.wallets')
    expect(insertIdx, 'insert в ledger должен присутствовать').toBeGreaterThan(-1)
    expect(updateIdx, 'update баланса должен присутствовать').toBeGreaterThan(-1)
    expect(insertIdx).toBeLessThan(updateIdx)
  })

  it('повтор с тем же ref ловится unique_violation и возвращает текущий баланс без движения по wallets', () => {
    const body = extractFunctionBody('wallet_spend')
    expect(body).toMatch(/exception\s+when\s+unique_violation\s+then/)
    // В обработчике unique_violation не должно быть update wallets - иначе
    // повтор всё равно тронул бы баланс.
    const exceptionBlock = body.slice(body.indexOf('exception'), body.indexOf('end;'))
    expect(exceptionBlock).not.toMatch(/update\s+public\.wallets/)
  })

  it('при нехватке денег строка ledger удаляется, а не остаётся призраком списания', () => {
    const body = extractFunctionBody('wallet_spend')
    expect(body).toMatch(/delete from public\.wallet_transactions where kind = 'spend' and ref = p_ref/)
  })

  it('баланс не может уйти в минус: update несёт условие balance_cents >= p_amount', () => {
    const body = extractFunctionBody('wallet_spend')
    expect(body).toMatch(/where user_id = p_user_id and balance_cents >= p_amount/)
  })
})

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

describe('20260813100000_gallery.sql: design закрыт column-grant\'ом', () => {
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

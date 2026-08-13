import { describe, expect, it } from 'vitest'
import { extractFunctionBody, readMigration } from './migrationSql'

describe('20260813110000_wallet.sql: wallet_spend идемпотентен по ref', () => {
  const sql = readMigration('20260813110000_wallet.sql')

  it('insert в wallet_transactions идёт раньше update баланса в wallets', () => {
    const body = extractFunctionBody(sql, 'wallet_spend')
    const insertIdx = body.indexOf('insert into public.wallet_transactions')
    const updateIdx = body.indexOf('update public.wallets')
    expect(insertIdx, 'insert в ledger должен присутствовать').toBeGreaterThan(-1)
    expect(updateIdx, 'update баланса должен присутствовать').toBeGreaterThan(-1)
    expect(insertIdx).toBeLessThan(updateIdx)
  })

  it('повтор с тем же ref ловится unique_violation и возвращает текущий баланс без движения по wallets', () => {
    const body = extractFunctionBody(sql, 'wallet_spend')
    expect(body).toMatch(/exception\s+when\s+unique_violation\s+then/)
    // В обработчике unique_violation не должно быть update wallets - иначе
    // повтор всё равно тронул бы баланс.
    const exceptionBlock = body.slice(body.indexOf('exception'), body.indexOf('end;'))
    expect(exceptionBlock).not.toMatch(/update\s+public\.wallets/)
  })

  it('при нехватке денег строка ledger удаляется, а не остаётся призраком списания', () => {
    const body = extractFunctionBody(sql, 'wallet_spend')
    expect(body).toMatch(/delete from public\.wallet_transactions where kind = 'spend' and ref = p_ref/)
  })

  it('баланс не может уйти в минус: update несёт условие balance_cents >= p_amount', () => {
    const body = extractFunctionBody(sql, 'wallet_spend')
    expect(body).toMatch(/where user_id = p_user_id and balance_cents >= p_amount/)
  })
})

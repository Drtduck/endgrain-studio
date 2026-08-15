import { describe, expect, it } from 'vitest'
// Тест физически лежит вне lib/supabase/ (та зона занята параллельным агентом),
// но по технике - точная копия lib/supabase/migrations.wallet.test.ts и
// lib/supabase/migrations.proPasses.test.ts: читаем сырой текст миграции
// и проверяем регулярками порядок операций и права. Живой Postgres в vitest
// не поднять, поэтому это единственная автоматическая проверка SQL.
import { extractFunctionBody, readMigration } from '@/lib/supabase/migrationSql'
import { shotSpendRef } from '@/lib/promo/spendRef'

describe('20260815100000_ai_credits.sql: таблицы без insert/update-политик, только service-role пишет', () => {
  const sql = readMigration('20260815100000_ai_credits.sql')

  it('ai_credits: только select-политика своей строки, записи из браузера нет', () => {
    expect(sql).toMatch(/create policy ai_credits_select_own/)
    expect(sql).not.toMatch(/create policy ai_credits_insert/)
    expect(sql).not.toMatch(/create policy ai_credits_update/)
  })

  it('ai_credit_transactions: только select-политика своей строки, записи из браузера нет', () => {
    expect(sql).toMatch(/create policy ai_credit_tx_select_own/)
    expect(sql).not.toMatch(/create policy ai_credit_tx_insert/)
    expect(sql).not.toMatch(/create policy ai_credit_tx_update/)
  })

  it('уникальный индекс (kind, ref) на ledger - вся идемпотентность держится на нём', () => {
    expect(sql).toMatch(/create unique index if not exists ai_credit_tx_kind_ref_idx\s+on public\.ai_credit_transactions \(kind, ref\)/)
  })

  it('баланс не может уйти в минус: check-constraint на обеих таблицах', () => {
    expect(sql).toMatch(/constraint ai_credits_balance_nonneg check \(balance >= 0\)/)
    expect(sql).toMatch(/constraint ai_credit_tx_balance_nonneg check \(balance_after >= 0\)/)
  })
})

describe('ai_credits_grant: insert-первый порядок идемпотентности, по образцу wallet_topup', () => {
  const sql = readMigration('20260815100000_ai_credits.sql')

  it('insert в ledger идёт раньше update баланса', () => {
    const body = extractFunctionBody(sql, 'ai_credits_grant')
    const insertIdx = body.indexOf('insert into public.ai_credit_transactions')
    const updateIdx = body.indexOf('update public.ai_credits')
    expect(insertIdx, 'insert в ledger должен присутствовать').toBeGreaterThan(-1)
    expect(updateIdx, 'update баланса должен присутствовать').toBeGreaterThan(-1)
    expect(insertIdx).toBeLessThan(updateIdx)
  })

  it('повтор с тем же ref ловится unique_violation и не двигает баланс дважды', () => {
    const body = extractFunctionBody(sql, 'ai_credits_grant')
    expect(body).toMatch(/exception\s+when\s+unique_violation\s+then/)
    // Ограничиваем срез первым `end;` после exception: это ровно тело
    // обработчика, а не хвост нормальной ветки функции (там update законно есть).
    const exceptionBlock = body.slice(body.indexOf('exception'), body.indexOf('end;', body.indexOf('exception')))
    expect(exceptionBlock).not.toMatch(/update\s+public\.ai_credits/)
  })
})

describe('consume_ai_units (20260815100000, версия ДО фикса блокера ревью 14.08.2026)', () => {
  const sql = readMigration('20260815100000_ai_credits.sql')
  const body = extractFunctionBody(sql, 'consume_ai_units')

  it('читает ai_usage и ai_credits под for update раньше первой записи', () => {
    const lockUsageIdx = body.indexOf('for update')
    const firstInsertIdx = body.indexOf('insert into public.ai_credit_transactions')
    expect(lockUsageIdx).toBeGreaterThan(-1)
    expect(firstInsertIdx).toBeGreaterThan(-1)
    expect(lockUsageIdx).toBeLessThan(firstInsertIdx)
  })

  it('бесплатная квота считается раньше остатка кадрами: v_free до v_rest', () => {
    const freeIdx = body.indexOf('v_free :=')
    const restIdx = body.indexOf('v_rest :=')
    expect(freeIdx).toBeGreaterThan(-1)
    expect(restIdx).toBeGreaterThan(-1)
    expect(freeIdx).toBeLessThan(restIdx)
  })

  it('не хватило кадров - ok:false с остатком без единого движения по счётчикам', () => {
    expect(body).toMatch(/'ok', false, 'free_available', v_free, 'credits_balance'/)
  })
})

/*
 * Блокер ревью 14.08.2026: «Повторить» отдаёт бесплатный кадр. До фикса ref
 * второй попытки байт в байт совпадал с рефом первой (ref = wallet_ref:shotId,
 * без номера попытки), а consume_ai_units (версия 20260815100000) трактовал
 * ЛЮБОЙ повторно встреченный ref как replay и не списывал ни разу, независимо
 * от того, вернулись ли уже деньги за первую попытку (released=true) или нет.
 * Кадр рисовался заново провайдером, а платить было не за что.
 *
 * Фикс - двухслойный:
 *  1) app/api/promo/shot/route.ts подмешивает номер попытки (retries) в ref
 *     через lib/promo/spendRef.shotSpendRef - у КАЖДОЙ попытки свой ref, и
 *     обычное совпадение ref остаётся только у настоящего двойного клика по
 *     ОДНОЙ и той же попытке (что и должно быть идемпотентным).
 *  2) миграция 20260815160000 переопределяет consume_ai_units: реплеем
 *     считается только строка с released=false. released=true (ref уже
 *     прожил полный цикл списание-возврат) больше не проходит бесплатно.
 *
 * Ниже - поведенческие тесты обеих половин фикса: ref действительно меняется
 * с номером попытки (и не меняется без него - двойной клик остаётся
 * бесплатным), а новая версия SQL-функции действительно отличает released от
 * не-released вместо безусловного `if found then`.
 */
describe('shotSpendRef: у каждой попытки свой ref, у повторного клика по той же попытке - тот же самый', () => {
  it('одинаковые wallet/shot/retries дают идентичный ref: обычный двойной клик остаётся бесплатным replay', () => {
    const first = shotSpendRef('wallet-1', 'shot-1', 0)
    const second = shotSpendRef('wallet-1', 'shot-1', 0)
    expect(first).toBe(second)
  })

  it('«Повторить» увеличивает retries - ref новой попытки отличается от ref предыдущей и спишет заново', () => {
    const attempt0 = shotSpendRef('wallet-1', 'shot-1', 0)
    const attempt1 = shotSpendRef('wallet-1', 'shot-1', 1)
    const attempt2 = shotSpendRef('wallet-1', 'shot-1', 2)
    expect(attempt1).not.toBe(attempt0)
    expect(attempt2).not.toBe(attempt0)
    expect(attempt2).not.toBe(attempt1)
  })

  it('ref завязан на shotId и walletRef: чужой кадр или чужая серия не пересекаются по рефу', () => {
    expect(shotSpendRef('wallet-1', 'shot-1', 0)).not.toBe(shotSpendRef('wallet-1', 'shot-2', 0))
    expect(shotSpendRef('wallet-1', 'shot-1', 0)).not.toBe(shotSpendRef('wallet-2', 'shot-1', 0))
  })
})

describe('consume_ai_units (20260815160000, версия ПОСЛЕ фикса): replay только для released=false', () => {
  const sql = readMigration('20260815160000_promo_fixes.sql')
  const body = extractFunctionBody(sql, 'consume_ai_units')

  it('читает ai_usage и ai_credits под for update раньше первой записи (не потеряно при переопределении)', () => {
    const lockUsageIdx = body.indexOf('for update')
    const firstInsertIdx = body.indexOf('insert into public.ai_credit_transactions')
    expect(lockUsageIdx).toBeGreaterThan(-1)
    expect(firstInsertIdx).toBeGreaterThan(-1)
    expect(lockUsageIdx).toBeLessThan(firstInsertIdx)
  })

  it('replay честного двойного клика: found и released=false - не списывает второй раз', () => {
    expect(body).toMatch(/if found and not v_existing\.released then/)
    expect(body).toMatch(/'replay', true/)
  })

  it('found и released=true - НЕ считается replay (ровно баг из ревью): списание отказывает, а не проходит бесплатно', () => {
    expect(body).toMatch(/if found and v_existing\.released then/)
    // Срез от второго `if found` до конца этой ветки: внутри не должно быть
    // 'replay', true - иначе фикс не отличается от старой (дырявой) версии.
    const deniedBranchStart = body.indexOf('if found and v_existing.released then')
    const deniedBranch = body.slice(deniedBranchStart, body.indexOf('end if;', deniedBranchStart))
    expect(deniedBranch).toMatch(/'ok', false/)
    expect(deniedBranch).not.toMatch(/'replay', true/)
  })

  it('бесплатная квота по-прежнему считается раньше остатка кадрами: v_free до v_rest', () => {
    const freeIdx = body.indexOf('v_free :=')
    const restIdx = body.indexOf('v_rest :=')
    expect(freeIdx).toBeGreaterThan(-1)
    expect(restIdx).toBeGreaterThan(-1)
    expect(freeIdx).toBeLessThan(restIdx)
  })

  it('не хватило кадров - ok:false с остатком без единого движения по счётчикам', () => {
    expect(body).toMatch(/'ok', false, 'free_available', v_free, 'credits_balance'/)
  })

  it('право выполнения по-прежнему только у service_role', () => {
    expect(sql).toMatch(
      /revoke all on function public\.consume_ai_units\(uuid, text, integer, integer, text, text, boolean, integer\) from public, anon, authenticated/,
    )
    expect(sql).toMatch(
      /grant execute on function public\.consume_ai_units\(uuid, text, integer, integer, text, text, boolean, integer\) to service_role/,
    )
  })
})

describe('settle_promo_series (20260815160000): серия-правка кадра больше не считается провалившейся', () => {
  const sql = readMigration('20260815160000_promo_fixes.sql')
  const body = extractFunctionBody(sql, 'settle_promo_series')

  it('фильтр по series_id не сужен до parent_shot_id is null - иначе серия-правка (её единственный кадр всегда с parent_shot_id) видна как ноль кадров', () => {
    expect(body).toMatch(/where series_id = p_series_id;/)
    expect(body).not.toMatch(/and parent_shot_id is null/)
  })

  it('право выполнения по-прежнему только у service_role', () => {
    expect(sql).toMatch(/revoke all on function public\.settle_promo_series\(uuid\) from public, anon, authenticated/)
    expect(sql).toMatch(/grant execute on function public\.settle_promo_series\(uuid\) to service_role/)
  })
})

describe('release_ai_units: возвращает ровно состав списанной строки, вернуть дважды нельзя', () => {
  const sql = readMigration('20260815100000_ai_credits.sql')
  const body = extractFunctionBody(sql, 'release_ai_units')

  it('читает строку списания по ref до всякой записи', () => {
    const selectIdx = body.indexOf("where kind = 'spend' and ref = p_ref")
    const insertIdx = body.indexOf("insert into public.ai_credit_transactions")
    expect(selectIdx).toBeGreaterThan(-1)
    expect(insertIdx).toBeGreaterThan(-1)
    expect(selectIdx).toBeLessThan(insertIdx)
  })

  it('повторный вызов по уже released строке не двигает счётчики второй раз', () => {
    expect(body).toMatch(/if v_spend\.released then/)
  })

  it('unique_violation на повторном refund тоже не считается ошибкой', () => {
    expect(body).toMatch(/exception\s+when\s+unique_violation\s+then/)
  })
})

describe('исполнение функций доступно только service_role', () => {
  const sql = readMigration('20260815100000_ai_credits.sql')

  it('revoke от public/anon/authenticated и grant execute только service_role', () => {
    expect(sql).toMatch(
      /revoke all on function public\.ai_credits_grant\(uuid, integer, text, text, integer, jsonb\) from public, anon, authenticated/,
    )
    expect(sql).toMatch(
      /revoke all on function public\.consume_ai_units\(uuid, text, integer, integer, text, text, boolean, integer\) from public, anon, authenticated/,
    )
    expect(sql).toMatch(/revoke all on function public\.release_ai_units\(uuid, text, text\) from public, anon, authenticated/)
    expect(sql).toMatch(
      /grant execute on function public\.ai_credits_grant\(uuid, integer, text, text, integer, jsonb\) to service_role/,
    )
    expect(sql).toMatch(
      /grant execute on function public\.consume_ai_units\(uuid, text, integer, integer, text, text, boolean, integer\) to service_role/,
    )
    expect(sql).toMatch(/grant execute on function public\.release_ai_units\(uuid, text, text\) to service_role/)
  })
})

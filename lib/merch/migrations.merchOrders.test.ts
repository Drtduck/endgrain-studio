import { describe, expect, it } from 'vitest'
// По образцу lib/ai/migrations.aiCredits.test.ts: живой Postgres в vitest не
// поднять, поэтому читаем сырой текст миграции и проверяем регулярками
// ключевые инварианты - права, RLS, ограничения статусов.
import { readMigration } from '@/lib/supabase/migrationSql'

describe('20260816100000_merch_orders.sql: структура таблицы merch_orders', () => {
  const sql = readMigration('20260816100000_merch_orders.sql')

  it('stripe_session_id уникален: одна сессия Stripe не может породить два заказа', () => {
    expect(sql).toMatch(/stripe_session_id\s+text unique/)
  })

  it('RLS включён на таблице', () => {
    expect(sql).toMatch(/alter table public\.merch_orders enable row level security/)
  })

  it('единственная политика - select своей строки, insert/update/delete из браузера нет', () => {
    expect(sql).toMatch(/create policy merch_orders_select_own on public\.merch_orders\s+for select to authenticated\s+using \(user_id = \(select auth\.uid\(\)\)\)/)
    expect(sql).not.toMatch(/create policy merch_orders_insert/)
    expect(sql).not.toMatch(/create policy merch_orders_update/)
    expect(sql).not.toMatch(/create policy merch_orders_delete/)
  })

  it('product ограничен ровно четырьмя товарами v1', () => {
    expect(sql).toMatch(/product\s+text not null check \(product in \('tshirt', 'mug', 'poster', 'apron'\)\)/)
  })

  it('size ограничен допустимыми размерами, включая one-size', () => {
    expect(sql).toMatch(/size\s+text not null check \(size in \('s', 'm', 'l', 'xl', 'one'\)\)/)
  })

  it('status - конечный автомат из пяти состояний с default pending_payment', () => {
    expect(sql).toMatch(/status\s+text not null default 'pending_payment'/)
    expect(sql).toMatch(
      /check \(status in \('pending_payment', 'paid', 'draft_created', 'failed', 'cancelled'\)\)/,
    )
  })

  it('деньги в центах не уходят в отрицательные значения, retail строго больше нуля', () => {
    expect(sql).toMatch(/retail_cents\s+integer not null check \(retail_cents > 0\)/)
    expect(sql).toMatch(/cost_cents\s+integer not null check \(cost_cents >= 0\)/)
    expect(sql).toMatch(/ship_cents\s+integer not null check \(ship_cents >= 0\)/)
  })

  it('project_id на delete set null, а не cascade: удаление проекта не должно стирать историю заказа', () => {
    expect(sql).toMatch(/project_id\s+uuid references public\.projects \(id\) on delete set null/)
  })

  it('user_id на delete cascade', () => {
    expect(sql).toMatch(/user_id\s+uuid not null references auth\.users \(id\) on delete cascade/)
  })

  it('триггер touch_updated_at навешан на обновление строки', () => {
    expect(sql).toMatch(/drop trigger if exists merch_orders_touch_updated_at on public\.merch_orders/)
    expect(sql).toMatch(
      /create trigger merch_orders_touch_updated_at\s+before update on public\.merch_orders\s+for each row execute function public\.touch_updated_at\(\)/,
    )
  })

  it('индекс по (user_id, created_at desc) для списка «Мои заказы»', () => {
    expect(sql).toMatch(/create index if not exists merch_orders_user_idx on public\.merch_orders \(user_id, created_at desc\)/)
  })

  it('частичный индекс по статусу покрывает только paid и failed', () => {
    expect(sql).toMatch(
      /create index if not exists merch_orders_status_idx on public\.merch_orders \(status\) where status in \('paid', 'failed'\)/,
    )
  })
})

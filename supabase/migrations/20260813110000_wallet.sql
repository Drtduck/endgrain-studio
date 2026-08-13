-- Кошелёк: баланс плюс ledger. Баланс это кэш суммы транзакций, а не
-- самостоятельная истина; при любом расхождении правы транзакции.
-- Пишут только SQL-функции ниже под service-role, ровно как consume_ai_quota
-- в 20260812140000_ai_usage_quota.sql.

create table if not exists public.wallets (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  balance_cents integer not null default 0,
  currency      text    not null default 'usd',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Уйти в минус нельзя даже по ошибке в коде: это последняя линия обороны
  -- под списанием, а не украшение.
  constraint wallets_balance_nonneg check (balance_cents >= 0),
  constraint wallets_currency check (currency = 'usd')
);

comment on table public.wallets is 'Баланс кошелька. Пишут только функции wallet_topup/wallet_spend/wallet_refund под service-role';

drop trigger if exists wallets_touch_updated_at on public.wallets;
create trigger wallets_touch_updated_at
  before update on public.wallets
  for each row execute function public.touch_updated_at();

alter table public.wallets enable row level security;

drop policy if exists wallets_select_own on public.wallets;
create policy wallets_select_own on public.wallets
  for select to authenticated
  using (user_id = (select auth.uid()));
-- Политик записи нет: пишут только функции ниже под service-role.

-- Ledger. Баланс это кэш суммы этих строк, а не самостоятельная истина:
-- при любом расхождении правы транзакции.
create table if not exists public.wallet_transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  kind          text not null,
  -- Со знаком: пополнение положительное, списание отрицательное. Так сумма
  -- столбца по пользователю обязана сойтись с balance_cents, и это проверяемо одним запросом.
  amount_cents  integer not null,
  balance_after integer not null,
  -- Внешний ключ идемпотентности: id сессии Stripe для пополнения,
  -- id задания генерации для списания и возврата.
  ref           text not null,
  meta          jsonb,
  created_at    timestamptz not null default now(),
  constraint wallet_tx_kind_allowed check (kind in ('topup', 'spend', 'refund')),
  constraint wallet_tx_amount_sign check (
    (kind = 'topup'  and amount_cents > 0) or
    (kind = 'spend'  and amount_cents < 0) or
    (kind = 'refund' and amount_cents > 0)
  ),
  constraint wallet_tx_balance_nonneg check (balance_after >= 0),
  constraint wallet_tx_ref_len check (char_length(ref) between 1 and 255),
  constraint wallet_tx_meta_size check (meta is null or pg_column_size(meta) <= 4096)
);

comment on table public.wallet_transactions is 'Ledger кошелька: сумма amount_cents по пользователю обязана сойтись с wallets.balance_cents';

-- Вся идемпотентность держится здесь. Повторная доставка вебхука, двойной клик
-- по кнопке генерации и ретрай возврата ловятся одним уникальным индексом.
create unique index if not exists wallet_tx_kind_ref_idx
  on public.wallet_transactions (kind, ref);

create index if not exists wallet_tx_user_idx
  on public.wallet_transactions (user_id, created_at desc);

alter table public.wallet_transactions enable row level security;

drop policy if exists wallet_tx_select_own on public.wallet_transactions;
create policy wallet_tx_select_own on public.wallet_transactions
  for select to authenticated
  using (user_id = (select auth.uid()));
-- Политик записи нет: см. выше.

/*
 * Пополнение. Первым идёт insert в ledger: если ref уже был (Stripe переотправил
 * событие), конфликт срабатывает, баланс не двигается, функция возвращает текущий.
 * Порядок операций тут и есть вся идемпотентность.
 */
create or replace function public.wallet_topup(
  p_user_id uuid,
  p_amount  integer,
  p_ref     text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  if p_amount is null or p_amount <= 0 then
    return null;
  end if;

  insert into public.wallets as w (user_id, balance_cents)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  -- Пометка идемпотентности ставится до движения денег.
  begin
    insert into public.wallet_transactions (user_id, kind, amount_cents, balance_after, ref)
    values (p_user_id, 'topup', p_amount, 0, p_ref);
  exception when unique_violation then
    select balance_cents into v_balance from public.wallets where user_id = p_user_id;
    return v_balance;
  end;

  update public.wallets
     set balance_cents = balance_cents + p_amount
   where user_id = p_user_id
  returning balance_cents into v_balance;

  update public.wallet_transactions
     set balance_after = v_balance
   where kind = 'topup' and ref = p_ref;

  return v_balance;
end;
$$;

/*
 * Списание. Идёт по тому же приёму, что и wallet_topup: первым идёт insert
 * в ledger с пометкой идемпотентности, и только потом двигается баланс.
 * Раньше update шёл первым - при повторном вызове с тем же ref (двойной клик,
 * ретрай после обрыва ответа) баланс списывался второй раз, а on conflict do
 * nothing на insert прятал только дубль строки в ledger, а не сам двойной
 * дебет. С insert-первым порядком повтор того же ref конфликтует раньше, чем
 * баланс тронут, и функция просто возвращает текущий баланс без списания.
 *
 * Условие where balance_cents >= p_amount внутри update и есть вся защита от
 * overdraft: два параллельных запроса с разными ref не могут оба увидеть 200
 * центов и оба уйти в генерацию. Если денег не хватило, пометка идемпотентности
 * удаляется - иначе ref навсегда остался бы «уже потрачен» без единого
 * реального движения денег, и пополнивший баланс человек не смог бы повторить
 * ту же попытку тем же ref.
 */
create or replace function public.wallet_spend(
  p_user_id uuid,
  p_amount  integer,
  p_ref     text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  if p_amount is null or p_amount <= 0 then
    return null;
  end if;

  begin
    insert into public.wallet_transactions (user_id, kind, amount_cents, balance_after, ref)
    values (p_user_id, 'spend', -p_amount, 0, p_ref);
  exception when unique_violation then
    select balance_cents into v_balance from public.wallets where user_id = p_user_id;
    return v_balance;
  end;

  update public.wallets
     set balance_cents = balance_cents - p_amount
   where user_id = p_user_id and balance_cents >= p_amount
  returning balance_cents into v_balance;

  if v_balance is null then
    -- Не хватило денег: пометка идемпотентности не должна пережить неудавшееся
    -- списание, иначе ref будет «сожжён» без единого движения по кошельку.
    delete from public.wallet_transactions where kind = 'spend' and ref = p_ref;
    return null;
  end if;

  update public.wallet_transactions
     set balance_after = v_balance
   where kind = 'spend' and ref = p_ref;

  return v_balance;
end;
$$;

/*
 * Возврат. Зовётся, только когда ролик не вышел вовсе. Уникальный индекс
 * по (kind, ref) не даёт вернуть деньги дважды за одно задание.
 */
create or replace function public.wallet_refund(
  p_user_id uuid,
  p_amount  integer,
  p_ref     text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  if p_amount is null or p_amount <= 0 then
    return null;
  end if;

  begin
    insert into public.wallet_transactions (user_id, kind, amount_cents, balance_after, ref)
    values (p_user_id, 'refund', p_amount, 0, p_ref);
  exception when unique_violation then
    select balance_cents into v_balance from public.wallets where user_id = p_user_id;
    return v_balance;
  end;

  update public.wallets
     set balance_cents = balance_cents + p_amount
   where user_id = p_user_id
  returning balance_cents into v_balance;

  update public.wallet_transactions
     set balance_after = v_balance
   where kind = 'refund' and ref = p_ref;

  return v_balance;
end;
$$;

-- Как и у квоты AI: вызов этих функций из браузера означал бы бесконечный баланс.
revoke all on function public.wallet_topup(uuid, integer, text)  from public, anon, authenticated;
revoke all on function public.wallet_spend(uuid, integer, text)  from public, anon, authenticated;
revoke all on function public.wallet_refund(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.wallet_topup(uuid, integer, text)  to service_role;
grant execute on function public.wallet_spend(uuid, integer, text)  to service_role;
grant execute on function public.wallet_refund(uuid, integer, text) to service_role;

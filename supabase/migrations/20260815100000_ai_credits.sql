-- Купленные кадры AI. Штуками, а не центами: цена кадра зависит от пакета,
-- и хранение в деньгах сделало бы счётчик «осталось кадров» делением с разным делителем.

create table if not exists public.ai_credits (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  balance    integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_credits_balance_nonneg check (balance >= 0)
);

comment on table public.ai_credits is 'Баланс купленных кадров AI. Пишут только функции ниже под service-role';

drop trigger if exists ai_credits_touch_updated_at on public.ai_credits;
create trigger ai_credits_touch_updated_at
  before update on public.ai_credits
  for each row execute function public.touch_updated_at();

alter table public.ai_credits enable row level security;

drop policy if exists ai_credits_select_own on public.ai_credits;
create policy ai_credits_select_own on public.ai_credits
  for select to authenticated using (user_id = (select auth.uid()));
-- Политик записи нет: пишут только функции ниже под service-role.

-- Ledger кадров. Он же учёт себестоимости и выручки: одна строка на одно
-- денежное или квотное движение, суммы провайдера и выручки лежат тут же.
create table if not exists public.ai_credit_transactions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  kind                text not null,
  -- В кадрах, со знаком: покупка и возврат положительные, списание нулевое или отрицательное
  -- (ноль значит «списали только бесплатную квоту», строка всё равно нужна для идемпотентности).
  amount              integer not null,
  balance_after       integer not null,
  ref                 text not null,
  feature             text,
  free_units          integer not null default 0,
  credit_units        integer not null default 0,
  provider_cost_cents integer not null default 0,
  revenue_cents       integer not null default 0,
  released            boolean not null default false,
  meta                jsonb,
  created_at          timestamptz not null default now(),
  constraint ai_credit_tx_kind_allowed check (kind in ('purchase', 'grant', 'spend', 'refund')),
  constraint ai_credit_tx_amount_sign check (
    (kind in ('purchase', 'grant', 'refund') and amount > 0) or
    (kind = 'spend' and amount <= 0)
  ),
  constraint ai_credit_tx_balance_nonneg check (balance_after >= 0),
  constraint ai_credit_tx_ref_len check (char_length(ref) between 1 and 255),
  constraint ai_credit_tx_meta_size check (meta is null or pg_column_size(meta) <= 4096)
);

comment on table public.ai_credit_transactions is 'Ledger кадров AI плюс учёт себестоимости: provider_cost_cents и revenue_cents';

create unique index if not exists ai_credit_tx_kind_ref_idx on public.ai_credit_transactions (kind, ref);
create index if not exists ai_credit_tx_user_idx on public.ai_credit_transactions (user_id, created_at desc);

alter table public.ai_credit_transactions enable row level security;

drop policy if exists ai_credit_tx_select_own on public.ai_credit_transactions;
create policy ai_credit_tx_select_own on public.ai_credit_transactions
  for select to authenticated using (user_id = (select auth.uid()));
-- Политик записи нет: пишут только функции ниже под service-role.

/*
 * Начисление кадров: покупка пакета (kind='purchase') или ручной подарок (kind='grant').
 * Порядок как в wallet_topup: сперва пометка идемпотентности, потом движение баланса.
 * p_revenue_cents кладётся в ledger ради маржи, на баланс не влияет.
 */
create or replace function public.ai_credits_grant(
  p_user_id       uuid,
  p_frames        integer,
  p_ref           text,
  p_kind          text default 'purchase',
  p_revenue_cents integer default 0,
  p_meta          jsonb default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  if p_frames is null or p_frames <= 0 then
    return null;
  end if;
  if p_kind not in ('purchase', 'grant') then
    return null;
  end if;

  insert into public.ai_credits as c (user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  -- Пометка идемпотентности ставится до движения кадров.
  begin
    insert into public.ai_credit_transactions
      (user_id, kind, amount, balance_after, ref, revenue_cents, meta)
    values
      (p_user_id, p_kind, p_frames, 0, p_ref, coalesce(p_revenue_cents, 0), p_meta);
  exception when unique_violation then
    select balance into v_balance from public.ai_credits where user_id = p_user_id;
    return v_balance;
  end;

  update public.ai_credits
     set balance = balance + p_frames
   where user_id = p_user_id
  returning balance into v_balance;

  update public.ai_credit_transactions
     set balance_after = v_balance
   where kind = p_kind and ref = p_ref;

  return v_balance;
end;
$$;

/*
 * Единая точка списания: сперва бесплатная месячная квота (ai_usage), остаток - кадрами.
 * Одна функция, а не два вызова из JS, ровно потому что это одна транзакция:
 * иначе списание квоты могло бы пройти, а списание кадров упасть, и человек
 * потерял бы бесплатные единицы без единого кадра на выходе.
 *
 * Блокировки берутся до любых записей: сперва считаем, хватает ли всего вместе,
 * и только потом двигаем счётчики. p_allow_free=false для не-Pro: у них
 * месячной квоты нет вовсе, платят только кадрами.
 *
 * Возвращает jsonb:
 *   { ok: true,  free: int, credits: int, credits_balance: int, quota_used: int, replay: bool }
 *   { ok: false, free_available: int, credits_balance: int }
 */
create or replace function public.consume_ai_units(
  p_user_id   uuid,
  p_period    text,
  p_limit     integer,
  p_cost      integer,
  p_ref       text,
  p_feature   text default null,
  p_allow_free boolean default true,
  p_provider_cost_cents integer default 0
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_existing public.ai_credit_transactions%rowtype;
  v_used integer := 0;
  v_free integer := 0;
  v_rest integer := 0;
  v_balance integer := 0;
begin
  if p_cost is null or p_cost <= 0 then
    return jsonb_build_object('ok', false, 'free_available', 0, 'credits_balance', 0);
  end if;

  -- Идемпотентность: тот же ref уже списан (двойной клик, ретрай действия).
  select * into v_existing from public.ai_credit_transactions
   where kind = 'spend' and ref = p_ref;
  if found then
    select coalesce(balance, 0) into v_balance from public.ai_credits where user_id = p_user_id;
    return jsonb_build_object('ok', true, 'replay', true,
      'free', v_existing.free_units, 'credits', v_existing.credit_units,
      'credits_balance', coalesce(v_balance, 0), 'quota_used', 0);
  end if;

  -- Блокируем обе строки до любых записей: два параллельных запроса обязаны разойтись.
  if p_allow_free then
    insert into public.ai_usage (user_id, period, used) values (p_user_id, p_period, 0)
      on conflict (user_id, period) do nothing;
    select used into v_used from public.ai_usage
      where user_id = p_user_id and period = p_period for update;
    v_free := least(p_cost, greatest(p_limit - coalesce(v_used, 0), 0));
  end if;

  insert into public.ai_credits (user_id, balance) values (p_user_id, 0)
    on conflict (user_id) do nothing;
  select balance into v_balance from public.ai_credits where user_id = p_user_id for update;

  v_rest := p_cost - v_free;
  if v_rest > coalesce(v_balance, 0) then
    return jsonb_build_object('ok', false, 'free_available', v_free, 'credits_balance', coalesce(v_balance, 0));
  end if;

  if v_free > 0 then
    update public.ai_usage set used = used + v_free
      where user_id = p_user_id and period = p_period;
  end if;

  if v_rest > 0 then
    update public.ai_credits set balance = balance - v_rest
      where user_id = p_user_id returning balance into v_balance;
  end if;

  insert into public.ai_credit_transactions
    (user_id, kind, amount, balance_after, ref, feature, free_units, credit_units, provider_cost_cents)
  values
    (p_user_id, 'spend', -v_rest, coalesce(v_balance, 0), p_ref, p_feature, v_free, v_rest, p_provider_cost_cents);

  return jsonb_build_object('ok', true, 'replay', false, 'free', v_free, 'credits', v_rest,
    'credits_balance', coalesce(v_balance, 0), 'quota_used', coalesce(v_used, 0) + v_free);
end;
$$;

/*
 * Возврат за то, что не вышло наружу. Читает строку списания по ref и
 * возвращает ровно её состав: бесплатные единицы в ai_usage, кадры на баланс
 * отдельной строкой ledger с kind='refund' и тем же ref (уникальный индекс
 * (kind, ref) не даёт вернуть дважды). Флаг released на строке списания -
 * вторая защита и заодно читаемость истории.
 */
create or replace function public.release_ai_units(p_user_id uuid, p_period text, p_ref text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_spend public.ai_credit_transactions%rowtype;
  v_balance integer;
begin
  select * into v_spend from public.ai_credit_transactions
   where kind = 'spend' and ref = p_ref and user_id = p_user_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_spend.released then
    return jsonb_build_object('ok', true, 'replay', true, 'free', v_spend.free_units, 'credits', v_spend.credit_units);
  end if;

  -- Пометка идемпотентности возврата ставится до движения счётчиков: повтор
  -- того же ref конфликтует раньше, чем баланс тронут.
  begin
    insert into public.ai_credit_transactions
      (user_id, kind, amount, balance_after, ref, feature, free_units, credit_units)
    values
      (p_user_id, 'refund', v_spend.free_units + v_spend.credit_units, 0, p_ref, v_spend.feature, v_spend.free_units, v_spend.credit_units);
  exception when unique_violation then
    return jsonb_build_object('ok', true, 'replay', true, 'free', v_spend.free_units, 'credits', v_spend.credit_units);
  end;

  if v_spend.free_units > 0 then
    update public.ai_usage
       set used = greatest(0, used - v_spend.free_units)
     where user_id = p_user_id and period = p_period;
  end if;

  if v_spend.credit_units > 0 then
    insert into public.ai_credits (user_id, balance) values (p_user_id, 0)
      on conflict (user_id) do nothing;
    update public.ai_credits
       set balance = balance + v_spend.credit_units
     where user_id = p_user_id
    returning balance into v_balance;

    update public.ai_credit_transactions
       set balance_after = v_balance
     where kind = 'refund' and ref = p_ref;
  end if;

  update public.ai_credit_transactions
     set released = true
   where kind = 'spend' and ref = p_ref;

  return jsonb_build_object('ok', true, 'replay', false, 'free', v_spend.free_units, 'credits', v_spend.credit_units);
end;
$$;

-- Старые consume_ai_quota и release_ai_quota не удаляются: их продолжает
-- звать пробный тир, и они остаются точкой отката.

revoke all on function public.ai_credits_grant(uuid, integer, text, text, integer, jsonb) from public, anon, authenticated;
revoke all on function public.consume_ai_units(uuid, text, integer, integer, text, text, boolean, integer) from public, anon, authenticated;
revoke all on function public.release_ai_units(uuid, text, text) from public, anon, authenticated;
grant execute on function public.ai_credits_grant(uuid, integer, text, text, integer, jsonb) to service_role;
grant execute on function public.consume_ai_units(uuid, text, integer, integer, text, text, boolean, integer) to service_role;
grant execute on function public.release_ai_units(uuid, text, text) to service_role;

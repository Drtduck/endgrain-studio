-- Волна 1 тарифной витрины: разовый Пропуск. $19, mode=payment, все возможности
-- Pro на 90 дней, без подписки и автопродления, карта не запоминается. Отдельная
-- таблица от subscriptions сознательно: пропуск не подписка Stripe, у него нет
-- ни plan, ни status, ни customer_id - только окно действия.

create table if not exists public.pro_passes (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  -- Внешний ключ идемпотентности вебхука: id сессии Stripe, ровно как ref
  -- в wallet_transactions.
  stripe_session_id text not null unique,
  granted_at        timestamptz not null default now(),
  expires_at        timestamptz not null,
  constraint pro_passes_session_len check (char_length(stripe_session_id) between 1 and 255),
  constraint pro_passes_expires_after_granted check (expires_at > granted_at)
);

comment on table public.pro_passes is 'Разовые Pro-пропуска на 90 дней. Пишет только функция grant_pro_pass под service-role';
comment on column public.pro_passes.stripe_session_id is 'id сессии Checkout (mode=payment), идемпотентность grant_pro_pass';

create index if not exists pro_passes_user_idx on public.pro_passes (user_id, expires_at desc);

alter table public.pro_passes enable row level security;

drop policy if exists pro_passes_select_own on public.pro_passes;
create policy pro_passes_select_own on public.pro_passes
  for select to authenticated
  using (user_id = (select auth.uid()));
-- Политик записи нет: пишет только функция ниже под service-role.

/*
 * Выдача/продление пропуска. Идемпотентна по stripe_session_id: повторная
 * доставка того же события просто ничего не делает (on conflict do nothing),
 * ровно как wallet_topup по ref. При уже живом пропуске новый не заменяет
 * старый, а продлевает его: 90 дней считаются от greatest(now(), текущий
 * максимум expires_at пользователя), так что купленные подряд пропуска
 * складываются, а не перетирают друг друга.
 */
create or replace function public.grant_pro_pass(p_user_id uuid, p_ref text, p_days int)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base     timestamptz;
  v_expires  timestamptz;
begin
  if p_days is null or p_days <= 0 then
    return null;
  end if;

  select greatest(now(), coalesce(max(expires_at), now()))
    into v_base
    from public.pro_passes
   where user_id = p_user_id;

  v_expires := v_base + make_interval(days => p_days);

  begin
    insert into public.pro_passes (user_id, stripe_session_id, expires_at)
    values (p_user_id, p_ref, v_expires);
  exception when unique_violation then
    select expires_at into v_expires
      from public.pro_passes
     where stripe_session_id = p_ref;
    return v_expires;
  end;

  return v_expires;
end;
$$;

revoke all on function public.grant_pro_pass(uuid, text, int) from public, anon, authenticated;
grant execute on function public.grant_pro_pass(uuid, text, int) to service_role;

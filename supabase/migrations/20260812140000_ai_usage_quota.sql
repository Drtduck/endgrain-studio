-- Квота AI-генераций: календарный месяц на пользователя.
-- Строку заводит и двигает только сервер под service-role ключом через функции
-- ниже. Пользователь свою строку исключительно читает, поэтому политика одна,
-- на select, а политик записи нет: любая запись из браузера означала бы, что
-- лимит обнуляется подделкой запроса.

create table if not exists public.ai_usage (
  user_id    uuid not null references auth.users (id) on delete cascade,
  -- Календарный месяц в UTC, формат YYYY-MM. Текстом, а не датой: ключ периода
  -- считается на сервере одной строкой и в таком же виде читается глазами в базе.
  period     text not null,
  used       integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, period),
  constraint ai_usage_period_format check (period ~ '^[0-9]{4}-[0-9]{2}$'),
  constraint ai_usage_used_range check (used >= 0)
);

comment on table public.ai_usage is 'Счётчик AI-генераций по месяцам. Пишут только функции consume_ai_quota и release_ai_quota под service-role';
comment on column public.ai_usage.period is 'Календарный месяц UTC в формате YYYY-MM';
comment on column public.ai_usage.used is 'Сколько генераций списано в этом месяце';

-- updated_at двигает та же триггерная функция, что у projects и subscriptions
-- (создана в 20260812090000, search_path зафиксирован в 20260812091000).
drop trigger if exists ai_usage_touch_updated_at on public.ai_usage;
create trigger ai_usage_touch_updated_at
  before update on public.ai_usage
  for each row execute function public.touch_updated_at();

alter table public.ai_usage enable row level security;

drop policy if exists ai_usage_select_own on public.ai_usage;
create policy ai_usage_select_own on public.ai_usage
  for select to authenticated
  using (user_id = (select auth.uid()));

/*
 * Атомарное списание. Весь смысл в одном insert ... on conflict do update where:
 * проверка лимита и инкремент происходят под одной блокировкой строки, поэтому
 * два параллельных запроса не могут оба увидеть used = 29 и уйти на 31.
 * Возвращает новое значение used либо null, если лимит выбран.
 */
create or replace function public.consume_ai_quota(
  p_user_id uuid,
  p_period  text,
  p_limit   integer,
  p_cost    integer default 1
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
begin
  if p_cost is null or p_cost <= 0 or p_limit is null or p_cost > p_limit then
    return null;
  end if;

  insert into public.ai_usage as u (user_id, period, used)
  values (p_user_id, p_period, p_cost)
  on conflict (user_id, period) do update
    set used = u.used + p_cost
    where u.used + p_cost <= p_limit
  returning u.used into v_used;

  -- Пустой returning значит, что do update отсеян условием: лимит выбран.
  return v_used;
end;
$$;

/*
 * Возврат списанного. Квота резервируется до похода в модель, и если ни одного
 * кадра не вышло, платить за это человеку не за что. greatest защищает от ухода
 * в минус, если возврат пришёл дважды.
 */
create or replace function public.release_ai_quota(
  p_user_id uuid,
  p_period  text,
  p_cost    integer default 1
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
begin
  if p_cost is null or p_cost <= 0 then
    return null;
  end if;

  update public.ai_usage
     set used = greatest(used - p_cost, 0)
   where user_id = p_user_id and period = p_period
  returning used into v_used;

  return v_used;
end;
$$;

-- Функции security definer: их вызов из браузера с любым лимитом в аргументе
-- означал бы бесконечную квоту, поэтому право выполнения есть только у сервера.
revoke all on function public.consume_ai_quota(uuid, text, integer, integer) from public;
revoke all on function public.consume_ai_quota(uuid, text, integer, integer) from anon;
revoke all on function public.consume_ai_quota(uuid, text, integer, integer) from authenticated;
grant execute on function public.consume_ai_quota(uuid, text, integer, integer) to service_role;

revoke all on function public.release_ai_quota(uuid, text, integer) from public;
revoke all on function public.release_ai_quota(uuid, text, integer) from anon;
revoke all on function public.release_ai_quota(uuid, text, integer) from authenticated;
grant execute on function public.release_ai_quota(uuid, text, integer) to service_role;

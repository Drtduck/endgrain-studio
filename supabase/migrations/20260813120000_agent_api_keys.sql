-- Agent-ready: API-ключи и метеринг запросов. Один писатель у обеих таблиц -
-- сервер под service-role ключом, потому что только он умеет посчитать sha256
-- ключа и атомарно проверить лимит. Стиль ровно как в 20260812130000
-- (subscriptions) и 20260812140000 (ai_usage): комментарии объясняют «почему»,
-- политики пишутся явно, отсутствие политики на запись - требование, а не
-- забывчивость.

create table if not exists public.api_keys (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  -- Метка, которую человек сам пишет в форме: "мой ноут", "n8n", "Claude Desktop".
  name         text not null,
  -- Видимая часть ключа. По ней и только по ней ищется строка при проверке
  -- запроса: искать по хешу означало бы полный скан при каждом обращении.
  prefix       text not null,
  -- sha256 полного ключа в hex. Ключ показывается человеку ровно один раз,
  -- в момент выдачи, и восстановить его из базы невозможно by design.
  key_hash     text not null,
  scopes       text[] not null default array['projects:read','projects:write','cutlist:read'],
  tier         text not null default 'free',
  last_used_at timestamptz,
  -- Ключ можно отозвать, не удаляя: история в api_usage ссылается на строку.
  revoked_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint api_keys_name_len   check (char_length(name) between 1 and 60),
  constraint api_keys_prefix_fmt check (prefix ~ '^egs_(live|test)_[0-9a-z]{8}$'),
  constraint api_keys_hash_fmt   check (key_hash ~ '^[0-9a-f]{64}$'),
  constraint api_keys_tier_allowed check (tier in ('free', 'developer')),
  constraint api_keys_scopes_nonempty check (array_length(scopes, 1) >= 1)
);

comment on table public.api_keys is 'Ключи агентского API. Пишет только сервер под service-role: вставка из браузера означала бы, что человек сам себе ставит tier: developer';
comment on column public.api_keys.prefix is 'Видимая часть ключа, глобально уникальна, по ней ищется строка при проверке запроса';
comment on column public.api_keys.key_hash is 'sha256(plaintext) в hex, ключ восстановить из базы нельзя';

create unique index if not exists api_keys_prefix_idx on public.api_keys (prefix);
create index if not exists api_keys_user_idx on public.api_keys (user_id, created_at desc);

-- updated_at двигает та же триггерная функция, что у projects, subscriptions и ai_usage
-- (создана в 20260812090000, search_path зафиксирован в 20260812091000).
drop trigger if exists api_keys_touch_updated_at on public.api_keys;
create trigger api_keys_touch_updated_at
  before update on public.api_keys
  for each row execute function public.touch_updated_at();

alter table public.api_keys enable row level security;

-- Свои ключи человек видит в аккаунте: список, метка, дата, последнее использование.
drop policy if exists api_keys_select_own on public.api_keys;
create policy api_keys_select_own on public.api_keys
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists api_keys_delete_own on public.api_keys;

-- Удаления из браузера нет сознательно: DELETE стирает строку целиком, а с ней
-- и историю api_usage (on delete cascade). Отзыв уже есть как update revoked_at
-- под service-role (app/actions/apiKeys.ts:revokeApiKeyAction) - строка остаётся,
-- ключ просто перестаёт работать. Политика api_keys_delete_own позволяла бы
-- удалить ключ и тут же создать новый под тем же лимитом API_KEYS_PER_USER,
-- не оставляя следа о том, что старый вообще исчерпал дневную квоту.

-- Политик insert, update и delete нет сознательно: строку заводит и правит
-- только сервер под service-role ключом, потому что только он умеет посчитать
-- sha256 и проверить лимиты.

-- Хеш без соли от 32 байт энтропии не брутфорсится, но отдавать его в браузер
-- незачем ни при какой выборке. Раньше здесь стоял `revoke select (key_hash)
-- from authenticated` - column-level revoke, который в Postgres НЕ отменяет
-- уже существующий табличный select (Supabase выдаёт его по умолчанию через
-- alter default privileges): табличный и колоночный гранты живут раздельно,
-- и key_hash оставался читаемым через select * как ни в чём не бывало.
-- Рабочий приём - тот же, что у design в published_projects (миграция
-- 20260813100000): сначала полный revoke select с самой таблицы, потом явный
-- список разрешённых колонок без key_hash.
revoke select on public.api_keys from authenticated;
grant select (id, user_id, name, prefix, scopes, tier, last_used_at, revoked_at, created_at, updated_at) on public.api_keys to authenticated;

-- Метеринг агрегированный, по ключу и календарному дню UTC: строка на запрос
-- стоила бы записи в базу на каждый вызов и дала бы данные, которыми MVP не пользуется.
create table if not exists public.api_usage (
  key_id     uuid not null references public.api_keys (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  -- День в UTC, формат YYYY-MM-DD. Текстом, а не датой: ключ периода считается
  -- на сервере одной строкой и в таком же виде читается глазами в базе.
  day        text not null,
  used       integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (key_id, day),
  constraint api_usage_day_format check (day ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  constraint api_usage_used_range check (used >= 0)
);

comment on table public.api_usage is 'Счётчик запросов API по дням. Пишет только функция consume_api_quota под service-role';
comment on column public.api_usage.day is 'Календарный день UTC в формате YYYY-MM-DD';

create index if not exists api_usage_user_day_idx on public.api_usage (user_id, day desc);

drop trigger if exists api_usage_touch_updated_at on public.api_usage;
create trigger api_usage_touch_updated_at
  before update on public.api_usage
  for each row execute function public.touch_updated_at();

alter table public.api_usage enable row level security;

drop policy if exists api_usage_select_own on public.api_usage;
create policy api_usage_select_own on public.api_usage
  for select to authenticated using (user_id = (select auth.uid()));

-- Политик записи нет: пишет только функция ниже под service-role.

/*
 * Атомарное списание лимита. Лимит считается по user_id за день - суммой
 * used по ВСЕМ ключам аккаунта, а не по одному ключу. Раньше конфликт был
 * (key_id, day): свежий ключ начинал день с used = 0, и человек, упёршийся в
 * дневной лимит, обходил его, просто создав новый ключ - лимит на аккаунт был
 * лимитом на ключ по факту. Строка в api_usage по-прежнему одна на (key_id, day)
 * - это нужно для честного usedToday на конкретном ключе в UI
 * (app/actions/apiKeys.ts:listApiKeysAction), но сам ПОТОЛОК проверяется по
 * сумме всех строк пользователя за день.
 *
 * pg_advisory_xact_lock сериализует конкурентные списания одного пользователя
 * за один день: без него первый вызов дня для двух разных ключей мог бы не
 * увидеть строк друг друга (блокировать через "for update" пока нечего) и оба
 * пройти лимит. Лочится на весь остаток транзакции и снимается автоматически.
 *
 * Возврат null значит «лимит выбран». Отдельной release_api_quota нет: HTTP-запрос
 * уже сделан, возвращать нечего.
 */
create or replace function public.consume_api_quota(
  p_key_id  uuid,
  p_user_id uuid,
  p_day     text,
  p_limit   integer,
  p_cost    integer default 1
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_before integer;
begin
  if p_cost is null or p_cost <= 0 or p_limit is null or p_cost > p_limit then
    return null;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_day, 0));

  select coalesce(sum(used), 0) into v_total_before
    from public.api_usage
   where user_id = p_user_id and day = p_day;

  if v_total_before + p_cost > p_limit then
    return null;
  end if;

  insert into public.api_usage as u (key_id, user_id, day, used)
  values (p_key_id, p_user_id, p_day, p_cost)
  on conflict (key_id, day) do update
    set used = u.used + p_cost;

  return v_total_before + p_cost;
end;
$$;

revoke all on function public.consume_api_quota(uuid, uuid, text, integer, integer) from public;
revoke all on function public.consume_api_quota(uuid, uuid, text, integer, integer) from anon;
revoke all on function public.consume_api_quota(uuid, uuid, text, integer, integer) from authenticated;
grant execute on function public.consume_api_quota(uuid, uuid, text, integer, integer) to service_role;

/*
 * Двигает last_used_at ключа. Отдельно от списания квоты, потому что она
 * обновляет api_keys, а не api_usage, и не должна попадать под транзакцию
 * списания: провал обновления метки не повод откатывать сам запрос.
 */
create or replace function public.touch_api_key(p_key_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.api_keys set last_used_at = now() where id = p_key_id;
end;
$$;

revoke all on function public.touch_api_key(uuid) from public;
revoke all on function public.touch_api_key(uuid) from anon;
revoke all on function public.touch_api_key(uuid) from authenticated;
grant execute on function public.touch_api_key(uuid) to service_role;

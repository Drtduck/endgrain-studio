-- Фаза 7: облачные проекты пользователя и обратная связь.
-- Аккаунт в студии необязателен, поэтому таблицы устроены так, чтобы аноним
-- мог оставить отзыв, но не мог увидеть ни чужой отзыв, ни чужой проект.

-- 1. Проекты пользователя ---------------------------------------------------

create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null default 'Без названия',
  design      jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint projects_name_len check (char_length(name) between 1 and 120),
  -- Документ студии это десятки килобайт. Полмегабайта это заведомо мусор
  -- или попытка использовать таблицу как файловое хранилище.
  constraint projects_design_size check (pg_column_size(design) <= 524288)
);

comment on table public.projects is 'Сохранённые в облако проекты досок Endgrain Studio';
comment on column public.projects.design is 'Документ Design из lib/engine, схема версионируется полем schemaVersion внутри JSON';

-- Список проектов всегда сортируется по дате правки в пределах одного юзера.
create index if not exists projects_user_updated_idx
  on public.projects (user_id, updated_at desc);

-- updated_at обязан двигаться сам: клиент в него не пишет и подделать порядок
-- списка не может.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projects_touch_updated_at on public.projects;
create trigger projects_touch_updated_at
  before update on public.projects
  for each row execute function public.touch_updated_at();

alter table public.projects enable row level security;

-- Владелец и только владелец. Четыре отдельные политики вместо одной "for all":
-- так insert проверяется по with check, а чтение по using, и подмена user_id
-- в теле запроса не проходит.
drop policy if exists projects_select_own on public.projects;
create policy projects_select_own on public.projects
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists projects_insert_own on public.projects;
create policy projects_insert_own on public.projects
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists projects_update_own on public.projects;
create policy projects_update_own on public.projects
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists projects_delete_own on public.projects;
create policy projects_delete_own on public.projects
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- 2. Обратная связь ----------------------------------------------------------

create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users (id) on delete set null,
  body        text not null,
  route       text,
  user_agent  text,
  locale      text,
  created_at  timestamptz not null default now(),
  constraint feedback_body_len check (char_length(body) between 1 and 2000),
  constraint feedback_route_len check (route is null or char_length(route) <= 512),
  constraint feedback_ua_len check (user_agent is null or char_length(user_agent) <= 512),
  constraint feedback_locale_allowed check (locale is null or locale in ('ru', 'en'))
);

comment on table public.feedback is 'Сообщения из кнопки «Предложить доработку», в том числе от анонимов';

create index if not exists feedback_created_idx on public.feedback (created_at desc);

alter table public.feedback enable row level security;

-- Писать может кто угодно, включая анонима: кнопка доступна без входа.
-- Подделать авторство нельзя: либо запись анонимная, либо user_id совпадает
-- с текущей сессией.
drop policy if exists feedback_insert_any on public.feedback;
create policy feedback_insert_any on public.feedback
  for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));

-- Читать свои сообщения может автор. Общий разбор обращений идёт из панели
-- Supabase под service-ключом, который в приложении не используется.
drop policy if exists feedback_select_own on public.feedback;
create policy feedback_select_own on public.feedback
  for select to authenticated
  using (user_id = (select auth.uid()));

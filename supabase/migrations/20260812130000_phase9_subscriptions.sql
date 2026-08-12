-- Фаза 9: подписка Pro через Stripe.
-- Одна строка на пользователя. Пишет в таблицу только вебхук под service-role
-- ключом, пользователь свою строку исключительно читает. Отсюда единственная
-- политика на select и отсутствие политик на запись: это не забывчивость,
-- а требование. Любая запись из браузера означала бы, что Pro включается
-- подделкой запроса.

create table if not exists public.subscriptions (
  user_id                uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id     text not null,
  stripe_subscription_id text not null,
  price_id               text not null,
  plan                   text not null,
  status                 text not null,
  -- Может быть null: в API-версиях начиная с 2025-03-31.basil период переехал
  -- на элементы подписки, и в редких формах события его нет вовсе.
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  -- event.created последнего применённого события. Защита от ретрая Stripe,
  -- который может доставить created после updated и откатить активную подписку.
  last_event_at          timestamptz not null default now(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint subscriptions_plan_allowed
    check (plan in ('monthly', 'yearly')),
  constraint subscriptions_status_allowed
    check (status in (
      'trialing', 'active', 'past_due', 'canceled',
      'incomplete', 'incomplete_expired', 'unpaid', 'paused'
    )),
  constraint subscriptions_customer_len
    check (char_length(stripe_customer_id) between 1 and 255),
  constraint subscriptions_subscription_len
    check (char_length(stripe_subscription_id) between 1 and 255),
  constraint subscriptions_price_len
    check (char_length(price_id) between 1 and 255)
);

comment on table public.subscriptions is 'Активные и прошлые подписки Pro. Единственный писатель - вебхук Stripe под service-role ключом';
comment on column public.subscriptions.last_event_at is 'event.created последнего применённого события Stripe, старее не применяем';
comment on column public.subscriptions.current_period_end is 'Конец оплаченного периода, null допустим';

-- Одна подписка Stripe не может принадлежать двум пользователям.
create unique index if not exists subscriptions_stripe_subscription_idx
  on public.subscriptions (stripe_subscription_id);

-- Разбор обращений в поддержку идёт от идентификатора клиента Stripe.
create index if not exists subscriptions_customer_idx
  on public.subscriptions (stripe_customer_id);

-- updated_at двигает та же триггерная функция, что и у projects
-- (создана в 20260812090000, search_path зафиксирован в 20260812091000).
drop trigger if exists subscriptions_touch_updated_at on public.subscriptions;
create trigger subscriptions_touch_updated_at
  before update on public.subscriptions
  for each row execute function public.touch_updated_at();

alter table public.subscriptions enable row level security;

-- Читать свою строку может владелец: страница тарифов показывает план и дату.
drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own on public.subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Политик insert, update и delete нет сознательно. Под RLS без политики операция
-- запрещена, а service-role ключ RLS обходит. Значит записать строку может
-- только вебхук, и никакой запрос из браузера, даже с валидным JWT, Pro не включит.

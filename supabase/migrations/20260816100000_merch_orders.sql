-- Заказы мерча: покупка идёт через нашу кассу, печать через Printful API.
--
-- Одна строка это один товар одного человека. Позиций больше одной в v1 не бывает:
-- корзины нет, каждая кнопка «Купить» это отдельная сессия Stripe и отдельный заказ.
-- Когда появится корзина, здесь появится merch_order_items, а не массив в jsonb.

create table if not exists public.merch_orders (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  -- Проект может быть удалён, а заказ на напечатанную футболку остаётся: set null, не cascade.
  project_id          uuid references public.projects (id) on delete set null,

  -- Что печатаем
  product             text not null check (product in ('tshirt', 'mug', 'poster', 'apron')),
  size                text not null check (size in ('s', 'm', 'l', 'xl', 'one')),
  variant_id          integer not null,
  -- Путь объекта в bucket merch-prints. Публичный url собирается из него, а не хранится:
  -- домен Storage может смениться, путь нет.
  print_path          text not null,

  -- Деньги, все в центах USD. Снимок на момент заказа: переоценке не подлежит никогда.
  retail_cents        integer not null check (retail_cents > 0),
  cost_cents          integer not null check (cost_cents >= 0),
  ship_cents          integer not null check (ship_cents >= 0),
  margin              numeric(4, 2) not null,
  currency            text not null default 'usd',

  -- Касса
  stripe_session_id   text unique,
  paid_at             timestamptz,

  -- Печать
  printful_order_id   text,
  printful_attempts   integer not null default 0,
  last_error          text,

  -- Куда везём. Заполняется вебхуком из данных Stripe, до оплаты пусто.
  ship_name           text,
  ship_address1       text,
  ship_address2       text,
  ship_city           text,
  ship_state          text,
  ship_country        text,
  ship_zip            text,
  ship_email          text,
  ship_phone          text,

  status              text not null default 'pending_payment'
                      check (status in ('pending_payment', 'paid', 'draft_created', 'failed', 'cancelled')),

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists merch_orders_user_idx on public.merch_orders (user_id, created_at desc);
create index if not exists merch_orders_status_idx on public.merch_orders (status) where status in ('paid', 'failed');

drop trigger if exists merch_orders_touch_updated_at on public.merch_orders;
create trigger merch_orders_touch_updated_at
before update on public.merch_orders
for each row execute function public.touch_updated_at();

alter table public.merch_orders enable row level security;

-- Читать свои заказы можно. Писать нельзя никому: единственный писатель это
-- service-role (server action создаёт строку, вебхук её двигает по статусам).
-- Ровно тот же приём, что в project_purchases (20260813100000_gallery.sql).
create policy merch_orders_select_own on public.merch_orders
  for select to authenticated
  using (user_id = (select auth.uid()));

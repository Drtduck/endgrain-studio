-- Волна 2 тарифной витрины: подписка API Developer живёт в той же таблице
-- subscriptions, что и Pro, просто под другим product. Раньше user_id был
-- первичным ключом - одна строка на пользователя, ровно на одну подписку.
-- Composite (user_id, product) даёт человеку одновременно живую Pro-подписку
-- и живую API-подписку без конфликта строк.

alter table public.subscriptions
  add column if not exists product text not null default 'pro';

alter table public.subscriptions
  add constraint subscriptions_product_allowed check (product in ('pro', 'api'));

comment on column public.subscriptions.product is 'Что оплачивает подписка: pro (студия) или api (Developer)';

-- Составной первичный ключ вместо user_id: имя старого ограничения
-- subscriptions_pkey задано Postgres автоматически при inline primary key.
alter table public.subscriptions drop constraint if exists subscriptions_pkey;
alter table public.subscriptions add primary key (user_id, product);

-- Уникальный индекс по stripe_subscription_id остаётся как есть: одна
-- подписка Stripe по-прежнему не может принадлежать двум пользователям,
-- и это верно независимо от продукта.

/*
 * Двигает tier всех неотозванных ключей API пользователя. Зовётся вебхуком
 * при апдейте подписки product='api': live-статус поднимает тир до 'developer',
 * смерть подписки (canceled/unpaid/incomplete_expired) опускает до 'free'.
 * Ключ виден один раз, тир на нём меняется сколько угодно раз - обновление
 * существующих строк, а не выдача новых.
 */
create or replace function public.set_api_tier(p_user_id uuid, p_tier text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_tier not in ('free', 'developer') then
    return;
  end if;

  update public.api_keys
     set tier = p_tier
   where user_id = p_user_id
     and revoked_at is null;
end;
$$;

revoke all on function public.set_api_tier(uuid, text) from public, anon, authenticated;
grant execute on function public.set_api_tier(uuid, text) to service_role;

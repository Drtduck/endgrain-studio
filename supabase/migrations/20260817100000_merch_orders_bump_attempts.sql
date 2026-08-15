-- Атомарный инкремент printful_attempts (ревью PR мерча 15.08.2026, п.9).
--
-- До этой миграции вебхук читал printful_attempts из уже прочитанной строки
-- заказа, прибавлял единицу в JS и писал обратно update(...).eq('id', ...)
-- без условия на старое значение. Две параллельные доставки одного события
-- Stripe (ретрай, дубль) читают одно и то же printful_attempts, обе пишут
-- одно и то же nextAttempts, и одна попытка теряется молча - потолок
-- MAX_PRINTFUL_ATTEMPTS достигается медленнее, чем должен, либо не
-- достигается вовсе на редких гонках.
--
-- Инкремент строкой SQL (printful_attempts = printful_attempts + 1) внутри
-- одного update решает это штатно: PostgREST/postgrest-js не даёт выразить
-- такое выражение из клиента напрямую, поэтому инкремент вынесен в функцию.
--
-- ВНИМАНИЕ: файл не применён на прод. Применить миграцию нужно руками
-- (mcp__supabase__apply_migration или supabase db push) до того, как вебхук
-- в проде начнёт звать merch_orders_bump_attempts - иначе вызов упадёт
-- с "function does not exist" и ответит 500 на каждое событие Printful-провала.

drop function if exists public.merch_orders_bump_attempts(uuid, text, boolean, int);

create function public.merch_orders_bump_attempts(
  p_order_id uuid,
  p_last_error text,
  p_force_failed boolean default false,
  p_max_attempts int default 5
)
returns table (printful_attempts int, status text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.merch_orders m
  set printful_attempts = m.printful_attempts + 1,
      last_error = p_last_error,
      status = case
        when p_force_failed then 'failed'
        when m.printful_attempts + 1 >= p_max_attempts then 'failed'
        else m.status
      end
  where m.id = p_order_id
  returning m.printful_attempts, m.status;
end;
$$;

comment on function public.merch_orders_bump_attempts(uuid, text, boolean, int) is
  'Атомарно инкрементирует printful_attempts и пишет last_error. p_force_failed=true (4xx от Printful) переводит заказ в failed сразу, иначе failed ставится по достижении p_max_attempts (5xx/таймаут). Возвращает новое значение счётчика и итоговый статус.';

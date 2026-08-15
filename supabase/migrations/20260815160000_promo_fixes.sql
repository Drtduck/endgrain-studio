-- Правки ревью перед коммитом (14.08.2026): свежая миграция вместо переписывания
-- 100000/130000/140000/150000 задним числом, как требует правило проекта.
--
-- 1) consume_ai_units: вторая линия обороны от бесплатного кадра через
--    «Повторить». Основной фикс - в app/api/promo/shot/route.ts и
--    app/actions/promo.ts, где ref второй попытки теперь содержит номер
--    попытки (retries) и больше не совпадает байт в байт с рефом первой.
--    Здесь - защита на случай, если где-то всё же прилетит уже
--    использованный и уже возвращённый (released=true) ref: раньше функция
--    считала это реплеем и списывала 0, отдавая настоящий кадр бесплатно.
--    Теперь реплеем считается только строка с released=false (обычный
--    двойной клик по кнопке, деньги ещё не возвращались); released=true
--    означает «этот ref уже прожил полный цикл списание-возврат», и вместо
--    молчаливого бесплатного пропуска функция отказывает - вызывающий код
--    обязан прийти с новым ref, как и должно быть после фикса ref.
--
-- 2) settle_promo_series: серия-правка кадра (source='edit') состоит из
--    ОДНОГО кадра, и у этого кадра parent_shot_id всегда заполнен (указывает
--    на корень группы вариантов в другой, исходной серии). Старый фильтр
--    «and parent_shot_id is null» убирал такой кадр из подсчёта начисто,
--    settle видел ноль кадров и закрывал серию как failed, даже когда
--    правка удалась. Фильтр убран: считаем все кадры СВОЕЙ серии, а у
--    обычных серий (presets/reference) собственные корневые кадры и так
--    никогда не имеют parent_shot_id - вариант-правка всегда отдельная
--    серия, так что расширение фильтра не задевает подсчёт обычных серий.
--
-- 3) promo_shots: колонки, которыми кадр запоминает, ЧЕМ именно он был
--    оплачен (тир и всё нужное для возврата). Reaper (app/api/promo/reap)
--    раньше жёстко считал каждый брошенный кадр оплаченным Pro-квотой и звал
--    release_ai_units, а кадр, оплаченный пробным тиром, вообще не имеет
--    строки в ai_credit_transactions - функция отвечала not_found, и пробная
--    попытка терялась навсегда. Теперь claim-запрос в route.ts пишет тир (и
--    всё, что нужно для возврата именно этим способом) на саму строку кадра,
--    и reaper читает это, а не гадает.

alter table public.promo_shots
  add column if not exists paid_tier text,
  add column if not exists paid_period text,
  add column if not exists paid_ref text,
  add column if not exists trial_subjects jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'promo_shots_paid_tier_allowed'
  ) then
    alter table public.promo_shots
      add constraint promo_shots_paid_tier_allowed check (paid_tier is null or paid_tier in ('pro', 'trial', 'credits'));
  end if;
end $$;

comment on column public.promo_shots.paid_tier is 'Чем оплачен кадр: pro | trial | credits, null - демо-режим без ключей, платить не за что';
comment on column public.promo_shots.paid_period is 'Период ai_usage на момент оплаты (только paid_tier=pro|credits) - нужен release_ai_units';
comment on column public.promo_shots.paid_ref is 'Ref списания в ai_credit_transactions (только paid_tier=pro|credits) - нужен release_ai_units';
comment on column public.promo_shots.trial_subjects is 'Субъекты пробного тира на момент оплаты (только paid_tier=trial) - нужен release_free_trial';

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
  if found and not v_existing.released then
    select coalesce(balance, 0) into v_balance from public.ai_credits where user_id = p_user_id;
    return jsonb_build_object('ok', true, 'replay', true,
      'free', v_existing.free_units, 'credits', v_existing.credit_units,
      'credits_balance', coalesce(v_balance, 0), 'quota_used', 0);
  end if;
  if found and v_existing.released then
    -- Этот ref уже прожил полный цикл списание-возврат: считать его реплеем
    -- значило бы отдать кадр бесплатно (см. комментарий в шапке файла).
    -- Вызывающий код обязан прийти с новым ref - тем же приёмом, каким чинится
    -- сам баг («Повторить» подмешивает номер попытки в ref).
    select coalesce(balance, 0) into v_balance from public.ai_credits where user_id = p_user_id;
    return jsonb_build_object('ok', false, 'free_available', 0, 'credits_balance', coalesce(v_balance, 0));
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

create or replace function public.settle_promo_series(p_series_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requested integer;
  v_succeeded integer;
  v_failed    integer;
  v_pending   integer;
  v_status    text;
begin
  select requested
    into v_requested
    from public.promo_series
   where id = p_series_id
   for update;

  if v_requested is null then
    return null;
  end if;

  select
    count(*) filter (where status = 'done'),
    count(*) filter (where status in ('failed', 'blocked', 'cancelled')),
    count(*) filter (where status in ('queued', 'running'))
    into v_succeeded, v_failed, v_pending
    from public.promo_shots
   where series_id = p_series_id;

  -- Серия ещё в работе: считаем счётчики, но статус не закрываем.
  if v_pending > 0 then
    update public.promo_series
       set succeeded = v_succeeded, failed = v_failed, status = 'running'
     where id = p_series_id;
    return jsonb_build_object('status', 'running', 'succeeded', v_succeeded, 'failed', v_failed);
  end if;

  v_status := case
    when v_succeeded = 0 then 'failed'
    when v_failed = 0 then 'done'
    else 'partial'
  end;

  update public.promo_series
     set succeeded = v_succeeded,
         failed = v_failed,
         status = v_status,
         finished_at = now()
   where id = p_series_id;

  return jsonb_build_object('status', v_status, 'succeeded', v_succeeded, 'failed', v_failed);
end;
$$;

revoke all on function public.consume_ai_units(uuid, text, integer, integer, text, text, boolean, integer) from public, anon, authenticated;
grant execute on function public.consume_ai_units(uuid, text, integer, integer, text, text, boolean, integer) to service_role;

revoke all on function public.settle_promo_series(uuid) from public, anon, authenticated;
grant execute on function public.settle_promo_series(uuid) to service_role;

-- Расчёт по серии одним вызовом: пересчитать исходы кадров и поставить статус
-- серии. Функция, а не запрос из JS, по той же причине, что и другие агрегаты
-- в проекте: кадры доезжают параллельно, и «прочитать счётчики, посчитать в
-- ноде, записать» это гонка, когда два кадра одной серии финишируют одновременно.
--
-- ВАЖНО про деньги/кадры (пересмотрено 14.08.2026, отменяет более раннюю
-- версию этой функции с пропорциональным refund_cents): эта функция НЕ
-- двигает ledger кадров и не возвращает refund_units/refund_cents. Кадры -
-- отдельный ledger в штуках, public.ai_credits/ai_credit_transactions
-- (20260815100000_ai_credits.sql). Резерв и возврат по нему идут ПОШТУЧНО:
-- route handler POST /api/promo/shot (P0-3) вызывает consume_ai_units при
-- захвате кадра в running и release_ai_units(ref = `${wallet_ref}:${shotId}`)
-- при провале ЭТОГО кадра - сразу, в том же запросе, а не тут пачкой. Поэтому
-- к моменту, когда settle_promo_series видит failed-кадр, его возврат уже
-- случился (или случится следующим шагом того же route handler); дублировать
-- эту арифметику здесь означало бы второй, рассинхронизирующийся ledger -
-- ровно тот дефект, которого экономика кадров как раз избегает.
--
-- Возвращает jsonb: { status, succeeded, failed }. Если серии с таким id нет - null.
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
   where series_id = p_series_id and parent_shot_id is null;

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

revoke all on function public.settle_promo_series(uuid) from public, anon, authenticated;
grant execute on function public.settle_promo_series(uuid) to service_role;

-- Бесплатный тир: три пробные генерации на субъект (аккаунт, гость по cookie, IP).
-- Отдельная таблица от ai_usage: у гостя нет user_id, попытки не сбрасываются
-- помесячно (колонка period тут была бы враньём), а смешивать месячную квоту
-- Pro и пожизненные пробные в одной строке значит однажды обнулить не то.

create table if not exists public.ai_free_trials (
  subject_kind text    not null,
  subject      text    not null,
  used         integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (subject_kind, subject),
  constraint ai_free_trials_kind check (subject_kind in ('user', 'guest', 'ip')),
  constraint ai_free_trials_used_range check (used >= 0),
  constraint ai_free_trials_subject_len check (length(subject) between 1 and 128)
);

comment on table public.ai_free_trials is 'Пробные AI-генерации по субъектам (аккаунт/гость/IP). Пишут только consume_free_trial и release_free_trial под service-role';
comment on column public.ai_free_trials.subject_kind is 'user | guest | ip';
comment on column public.ai_free_trials.subject is 'user.id, uuid гостя из подписанной cookie, либо sha256(FREE_TRIAL_SECRET + ip)';
comment on column public.ai_free_trials.used is 'Сколько пробных генераций списано, никогда не сбрасывается';

-- Внешнего ключа на auth.users нет намеренно: в таблице лежат три вида
-- субъекта, и два из трёх пользователями не являются.

drop trigger if exists ai_free_trials_touch_updated_at on public.ai_free_trials;
create trigger ai_free_trials_touch_updated_at
  before update on public.ai_free_trials
  for each row execute function public.touch_updated_at();

-- RLS включён, политик не заводим ни одной, даже на select: остаток пробных
-- приезжает в интерфейс пропсом из серверного layout, а гостевые строки не
-- принадлежат никому. Включённый RLS без политик это полный запрет для
-- anon и authenticated.
alter table public.ai_free_trials enable row level security;

/*
 * Атомарное списание сразу по нескольким субъектам, всё-или-ничего: списать
 * гостю и не списать по адресу означало бы сжечь попытку впустую.
 *
 * p_subjects: jsonb-массив объектов {"kind": "...", "id": "...", "limit": n}.
 * Возвращает {"ok": true, "remaining": n} либо {"ok": false, "blocked": "ip"}.
 */
create or replace function public.consume_free_trial(p_subjects jsonb, p_cost integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subject   jsonb;
  v_kind      text;
  v_id        text;
  v_limit     integer;
  v_used      integer;
  v_remaining integer;
  v_min_remaining integer := null;
  v_blocked   text;
begin
  if p_cost is null or p_cost <= 0 or p_subjects is null then
    return jsonb_build_object('ok', false, 'blocked', 'invalid');
  end if;

  begin
    -- Детерминированный порядок блокировок по (kind, id): единственная защита
    -- от дедлока, когда два параллельных запроса делят субъект ip.
    for v_subject in
      select value from jsonb_array_elements(p_subjects) as t(value)
      order by (value ->> 'kind'), (value ->> 'id')
    loop
      v_kind := v_subject ->> 'kind';
      v_id := v_subject ->> 'id';
      v_limit := (v_subject ->> 'limit')::integer;

      if v_kind is null or v_id is null or v_limit is null or p_cost > v_limit then
        v_blocked := coalesce(v_kind, 'invalid');
        raise exception using errcode = 'P0001';
      end if;

      insert into public.ai_free_trials as f (subject_kind, subject, used)
      values (v_kind, v_id, p_cost)
      on conflict (subject_kind, subject) do update
        set used = f.used + p_cost
        where f.used + p_cost <= v_limit
      returning f.used into v_used;

      if v_used is null then
        -- Пустой returning значит, что do update отсеян условием: потолок выбран.
        v_blocked := v_kind;
        raise exception using errcode = 'P0001';
      end if;

      v_remaining := v_limit - v_used;
      if v_min_remaining is null or v_remaining < v_min_remaining then
        v_min_remaining := v_remaining;
      end if;
    end loop;
  exception
    when sqlstate 'P0001' then
      -- Подтранзакция откатывается: уже сделанные инкременты этого вызова
      -- исчезают, переменные plpgsql переживают откат.
      return jsonb_build_object('ok', false, 'blocked', v_blocked);
  end;

  -- remaining это минимум остатка по всем субъектам: самое строгое ограничение.
  return jsonb_build_object('ok', true, 'remaining', coalesce(v_min_remaining, 0));
end;
$$;

/*
 * Возврат списанного по всем субъектам: зовётся, когда наружу не вышло ни
 * одного кадра. greatest защищает от ухода в минус при повторном возврате.
 */
create or replace function public.release_free_trial(p_subjects jsonb, p_cost integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subject jsonb;
  v_kind    text;
  v_id      text;
begin
  if p_cost is null or p_cost <= 0 or p_subjects is null then
    return jsonb_build_object('ok', false);
  end if;

  for v_subject in select value from jsonb_array_elements(p_subjects) as t(value)
  loop
    v_kind := v_subject ->> 'kind';
    v_id := v_subject ->> 'id';
    if v_kind is null or v_id is null then continue; end if;

    update public.ai_free_trials
       set used = greatest(used - p_cost, 0)
     where subject_kind = v_kind and subject = v_id;
  end loop;

  return jsonb_build_object('ok', true);
end;
$$;

-- Функции принимают лимит аргументом: их вызов из браузера означал бы
-- бесконечный бесплатный тир, поэтому право выполнения только у сервера.
revoke all on function public.consume_free_trial(jsonb, integer) from public;
revoke all on function public.consume_free_trial(jsonb, integer) from anon;
revoke all on function public.consume_free_trial(jsonb, integer) from authenticated;
grant execute on function public.consume_free_trial(jsonb, integer) to service_role;

revoke all on function public.release_free_trial(jsonb, integer) from public;
revoke all on function public.release_free_trial(jsonb, integer) from anon;
revoke all on function public.release_free_trial(jsonb, integer) from authenticated;
grant execute on function public.release_free_trial(jsonb, integer) to service_role;

-- Request-phase milestone term guards (run on local DB only).
--   docker exec -i supabase_db_paidaid psql -U postgres -d postgres < scripts/security/v25-request-milestone-terms.sql

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'milestone_offer_status' and n.nspname = 'public'
  ) then
    raise exception 'missing milestone_offer_status — run migrations';
  end if;
end;
$$;

-- validate_milestone_schedule_json structural negatives
do $$
begin
  begin
    perform public.validate_milestone_schedule_json('[{"position":1,"title":"A","amount":"1"}]'::jsonb, 1);
    raise exception 'expected reject single milestone';
  exception when others then
    if sqlerrm not like '%between 2 and 5%' then
      raise;
    end if;
  end;

  begin
    perform public.validate_milestone_schedule_json(
      '[
        {"position":1,"title":"A","amount":"1"},
        {"position":2,"title":"B","amount":"1"},
        {"position":3,"title":"C","amount":"1"},
        {"position":4,"title":"D","amount":"1"},
        {"position":5,"title":"E","amount":"1"},
        {"position":6,"title":"F","amount":"1"}
      ]'::jsonb,
      6
    );
    raise exception 'expected reject six milestones';
  exception when others then
    if sqlerrm not like '%between 2 and 5%' then
      raise;
    end if;
  end;

  begin
    perform public.validate_milestone_schedule_json(
      '[{"position":1,"title":"A","amount":"0"},{"position":2,"title":"B","amount":"1"}]'::jsonb,
      1
    );
    raise exception 'expected reject zero amount';
  exception when others then
    if sqlerrm not like '%positive integer%' then
      raise;
    end if;
  end;

  begin
    perform public.validate_milestone_schedule_json(
      '[{"position":1,"title":"A","amount":"1"},{"position":2,"title":"B","amount":"1"}]'::jsonb,
      3
    );
    raise exception 'expected reject sum mismatch';
  exception when others then
    if sqlerrm not like '%sum to budget%' then
      raise;
    end if;
  end;
end;
$$;

-- prepare_acceptance_funding gates milestone funding on agreed terms
do $$
declare
  v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.proname = 'prepare_acceptance_funding' and n.nspname = 'public'
  order by p.oid desc
  limit 1;

  if v_src is null
     or v_src not like '%milestone terms must be agreed before funding%'
     or v_src not like '%milestone_offer_status%' then
    raise exception 'prepare_acceptance_funding must gate milestone funding';
  end if;
end;
$$;

-- Required RPCs exist and authenticated may call request-phase milestone RPCs
do $$
begin
  if not exists (
    select 1 from pg_proc
    where proname = 'review_response_milestone_proposal'
      and pronamespace = 'public'::regnamespace
  ) then
    raise exception 'missing review_response_milestone_proposal';
  end if;
  if not exists (
    select 1 from pg_proc
    where proname = 'get_agreed_milestone_schedule_for_response'
      and pronamespace = 'public'::regnamespace
  ) then
    raise exception 'missing get_agreed_milestone_schedule_for_response';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.create_request(text, text, public.timing_type, timestamptz, timestamptz, timestamptz, numeric, uuid, public.location_kind, text, jsonb, uuid[], boolean, public.engagement_payment_mode, jsonb)',
    'EXECUTE'
  ) then
    raise exception 'authenticated must execute create_request with payment_mode';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.record_milestone_settlement_progress(uuid, public.engagement_settlement_status, text, text)',
    'EXECUTE'
  ) then
    raise exception 'authenticated must not call record_milestone_settlement_progress';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.complete_engagement_after_milestone_settlement(uuid)',
    'EXECUTE'
  ) then
    raise exception 'authenticated must not call complete_engagement_after_milestone_settlement';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.mark_milestone_settlement_eligible(uuid)',
    'EXECUTE'
  ) then
    raise exception 'authenticated must not call mark_milestone_settlement_eligible';
  end if;
end;
$$;

-- requests.payment_mode column present
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'requests'
      and column_name = 'payment_mode'
  ) then
    raise exception 'requests.payment_mode missing';
  end if;
end;
$$;

select 'v25 request milestone terms security checks OK' as result;

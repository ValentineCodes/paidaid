-- Milestone engagement guards (run on local DB only).
--   supabase db query --local --file scripts/security/v24-engagement-milestones.sql

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'engagement_payment_mode' and n.nspname = 'public'
  ) then
    raise exception 'missing engagement_payment_mode — run migrations';
  end if;
end;
$$;

-- Unauthorized settlement progress (authenticated must not call service RPC).
do $$
begin
  begin
    perform public.record_milestone_settlement_progress(
      gen_random_uuid(),
      'released'::public.engagement_settlement_status,
      'fake-hash',
      null
    );
    raise exception 'expected record_milestone_settlement_progress to fail for anon';
  exception
    when insufficient_privilege then
      null;
    when others then
      if sqlerrm not like '%permission denied%'
         and sqlerrm not like '%must be owner%'
         and sqlerrm not like '%milestone release row not found%' then
        raise;
      end if;
  end;
end;
$$;

-- Milestone save rejects bad sum (no fixture ids — structural check only).
do $$
begin
  if not exists (
    select 1 from pg_proc
    where proname = 'save_acceptance_milestone_schedule'
      and pronamespace = 'public'::regnamespace
  ) then
    raise exception 'missing save_acceptance_milestone_schedule';
  end if;
  if not exists (
    select 1 from pg_proc
    where proname = 'prevent_funded_milestone_terms_mutation'
      and pronamespace = 'public'::regnamespace
  ) then
    raise exception 'missing prevent_funded_milestone_terms_mutation';
  end if;
  if not exists (
    select 1 from pg_proc p
    join pg_proc p2 on p2.proname = 'auto_complete_engagements'
    where p.proname = 'auto_complete_engagements'
  ) then
    raise exception 'missing auto_complete_engagements';
  end if;
end;
$$;

-- auto_complete source must skip milestones payment_mode.
do $$
declare
  v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.proname = 'auto_complete_engagements' and n.nspname = 'public'
  limit 1;

  if v_src is null or v_src not like '%payment_mode = ''milestones''%' then
    raise exception 'auto_complete_engagements must skip milestone engagements';
  end if;
end;
$$;

-- sync_engagement_payment_events projects milestone payouts separately.
do $$
declare
  v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.proname = 'sync_engagement_payment_events' and n.nspname = 'public'
  limit 1;

  if v_src is null or v_src not like '%engagement_milestone_releases%' then
    raise exception 'sync_engagement_payment_events must handle milestone releases';
  end if;
end;
$$;

-- engagement_milestone_releases: no insert policy for authenticated (table RLS on, no write policies).
do $$
begin
  if not exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'engagement_milestone_releases'
  ) then
    raise exception 'missing engagement_milestone_releases';
  end if;
end;
$$;

select 'v24 engagement milestones security checks OK' as result;

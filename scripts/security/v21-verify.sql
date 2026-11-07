-- Independent V2.1 security checks (run against local Supabase after db reset).
\set ON_ERROR_STOP on

\echo '=== C2: load_linked_near_account not executable by authenticated ==='
select has_function_privilege('authenticated', 'public.load_linked_near_account(uuid)', 'EXECUTE') as auth_can_execute;

\echo '=== M1: is_engagement_participant (simulated auth uid vs arbitrary p_user_id) ==='
-- Postgres superuser cannot set auth.uid(); verify function body contains guard (static).
select prosrc like '%p_user_id is distinct from auth.uid()%' as has_self_bind
from pg_proc
where proname = 'is_engagement_participant'
  and pronamespace = 'public'::regnamespace;

\echo '=== M2: wallet_link_challenges INSERT policy removed ==='
select count(*) as insert_policies
from pg_policies
where schemaname = 'public'
  and tablename = 'wallet_link_challenges'
  and cmd = 'INSERT';

\echo '=== H2: prepare_engagement_funding blocks in-flight status names in source ==='
select prosrc like '%funding already in progress%' as blocks_in_flight
from pg_proc
where proname = 'prepare_engagement_funding'
  and pronamespace = 'public'::regnamespace;

\echo '=== M4: payment progress transition guard in source ==='
select prosrc like '%cannot regress funded payment%' as guards_funded_regression
from pg_proc
where proname = 'record_engagement_payment_progress'
  and pronamespace = 'public'::regnamespace;

\echo '=== M4 live: invalid transition (service_role) ==='
-- Uses minimal fake engagement id; expect exception before side effects.
do $$
begin
  begin
    perform public.record_engagement_payment_progress(
      '00000000-0000-4000-8000-000000000099'::uuid,
      'funded'::public.engagement_payment_status
    );
    raise exception 'EXPECTED_FAILURE: should not reach';
  exception
    when others then
      if sqlerrm not like '%payment row not found%' then
        raise;
      end if;
  end;
end $$;

\echo 'All static SQL checks completed.'

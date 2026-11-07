-- V2.2 fund-on-acceptance checks (run after db reset).
-- supabase db query "$(cat scripts/security/v22-fund-on-acceptance.sql)"

select
  has_function_privilege('authenticated', 'public.accept_response(uuid, uuid)', 'EXECUTE')
    as auth_can_direct_accept,
  has_function_privilege(
    'authenticated',
    'public.prepare_acceptance_funding(uuid, uuid, text, text, text, timestamptz)',
    'EXECUTE'
  ) as auth_can_prepare,
  has_function_privilege(
    'authenticated',
    'public.record_acceptance_funding_progress(uuid, public.acceptance_funding_intent_status, public.engagement_payment_status, bigint, text, text, text)',
    'EXECUTE'
  ) as auth_can_record_progress,
  has_function_privilege(
    'authenticated',
    'public.finalize_acceptance_after_funding(uuid)',
    'EXECUTE'
  ) as auth_can_finalize,
  has_function_privilege(
    'authenticated',
    'public.accept_response_with_ids(uuid, uuid, uuid, uuid)',
    'EXECUTE'
  ) as auth_can_accept_with_ids,
  (
    select prosrc like '%Escrow must be funded before delivery%'
    from pg_proc
    where proname = 'submit_delivery'
      and pronamespace = 'public'::regnamespace
  ) as gates_unfunded_delivery,
  (
    select indexdef like '%where%'
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'acceptance_funding_intents_one_active_per_request'
  ) as partial_unique_active_intent,
  has_function_privilege(
    'authenticated',
    'public.record_engagement_payment_progress(uuid, public.engagement_payment_status, bigint, text, text, text)',
    'EXECUTE'
  ) as auth_can_engagement_pay_progress;

-- Phase 4 shared escrow payment record checks (run after db reset / migration apply).
-- supabase db query --file scripts/security/v23-shared-escrow-payments.sql

select exists (
  select 1
  from pg_indexes
  where schemaname = 'public'
    and indexname = 'engagement_escrow_payments_chain_contract_on_chain_uniq'
) as chain_contract_escrow_unique_index;

select exists (
  select 1
  from pg_indexes
  where schemaname = 'public'
    and indexname = 'engagement_escrow_payments_one_funded_per_engagement'
) as one_funded_per_engagement_index;

select exists (
  select 1
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'engagement_escrow_payments'
    and column_name = 'request_id'
) as payment_has_request_id;

select exists (
  select 1
  from pg_trigger
  where tgname = 'engagement_escrow_payments_funded_terms_immutable'
) as funded_terms_immutable_trigger;

select
  has_function_privilege(
    'authenticated',
    'public.record_acceptance_funding_progress(uuid, public.acceptance_funding_intent_status, public.engagement_payment_status, bigint, text, text, text)',
    'EXECUTE'
  ) as auth_cannot_record_acceptance_progress,
  has_function_privilege(
    'authenticated',
    'public.record_engagement_payment_progress(uuid, public.engagement_payment_status, bigint, text, text, text)',
    'EXECUTE'
  ) as auth_cannot_record_engagement_progress;

select
  pg_get_functiondef(p.oid) like '%on_chain_escrow_id required before marking funded%'
    as acceptance_progress_requires_escrow_id,
  pg_get_functiondef(p.oid) like '%fund tx hash required before marking funded%'
    as acceptance_progress_requires_fund_hash
from pg_proc p
where p.proname = 'record_acceptance_funding_progress'
  and p.pronamespace = 'public'::regnamespace;

select
  pg_get_functiondef(p.oid) like '%prepared%funded%'
    as engagement_progress_allows_prepared_to_funded
from pg_proc p
where p.proname = 'record_engagement_payment_progress'
  and p.pronamespace = 'public'::regnamespace;

select count(*)::int as payments_missing_request_with_engagement
from public.engagement_escrow_payments ep
where ep.engagement_id is not null
  and ep.request_id is null;

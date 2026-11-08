\echo '=== Phase 4: wallet snapshot schema ==='
select column_name, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'requests'
  and column_name = 'requester_near_account_id';

select column_name, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'request_responses'
  and column_name = 'responder_near_account_id';

select has_function_privilege(
  'authenticated',
  'public.require_auth_linked_near_account()',
  'EXECUTE'
) as auth_can_execute_require_wallet;

select has_function_privilege(
  'authenticated',
  'public.complete_wallet_authentication(uuid, uuid, text, text, text)',
  'EXECUTE'
) as auth_can_complete_wallet_auth;

select has_function_privilege(
  'authenticated',
  'public.apply_near_wallet_link(uuid, uuid, text, text)',
  'EXECUTE'
) as auth_can_apply_wallet_link;

\echo '=== resolve_participant_near_accounts not granted to authenticated ==='
select has_function_privilege(
  'authenticated',
  'public.resolve_participant_near_accounts(public.requests, public.request_responses, uuid)',
  'EXECUTE'
) as auth_can_resolve_accounts;

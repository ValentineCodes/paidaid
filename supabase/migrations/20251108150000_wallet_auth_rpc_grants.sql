-- Harden service-role-only wallet RPCs (PostgREST must not call without signature verify).

revoke all on function public.complete_wallet_authentication(uuid, uuid, text, text, text) from public;
revoke all on function public.complete_wallet_authentication(uuid, uuid, text, text, text) from anon;
revoke all on function public.complete_wallet_authentication(uuid, uuid, text, text, text) from authenticated;
grant execute on function public.complete_wallet_authentication(uuid, uuid, text, text, text) to service_role;

revoke all on function public.apply_near_wallet_link(uuid, uuid, text, text) from public;
revoke all on function public.apply_near_wallet_link(uuid, uuid, text, text) from anon;
revoke all on function public.apply_near_wallet_link(uuid, uuid, text, text) from authenticated;
grant execute on function public.apply_near_wallet_link(uuid, uuid, text, text) to service_role;

revoke all on function public.lookup_user_id_by_near_wallet(text) from public;
revoke all on function public.lookup_user_id_by_near_wallet(text) from anon;
revoke all on function public.lookup_user_id_by_near_wallet(text) from authenticated;
grant execute on function public.lookup_user_id_by_near_wallet(text) to service_role;

revoke all on function public.require_auth_linked_near_account() from public;
revoke all on function public.require_auth_linked_near_account() from anon;
revoke all on function public.require_auth_linked_near_account() from authenticated;

revoke all on function public.resolve_participant_near_accounts(public.requests, public.request_responses, uuid) from public;
revoke all on function public.resolve_participant_near_accounts(public.requests, public.request_responses, uuid) from anon;
revoke all on function public.resolve_participant_near_accounts(public.requests, public.request_responses, uuid) from authenticated;

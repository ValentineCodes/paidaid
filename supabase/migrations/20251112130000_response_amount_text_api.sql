-- Return proposed_amount as text in JSON so yocto-scale values are not IEEE-rounded.

create or replace view public.request_responses_api
with (security_invoker = true)
as
select
  id,
  request_id,
  provider_profile_id,
  message,
  proposed_amount::text as proposed_amount,
  proposed_asset_id,
  status,
  responder_near_account_id,
  created_at,
  updated_at
from public.request_responses;

grant select on public.request_responses_api to authenticated;
grant select on public.request_responses_api to anon;

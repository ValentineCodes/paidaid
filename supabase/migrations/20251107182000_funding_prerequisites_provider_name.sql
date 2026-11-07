-- Enrich funding prerequisites for clearer requester UX.

drop function if exists public.get_engagement_funding_prerequisites(uuid);

create or replace function public.get_engagement_funding_prerequisites(
  p_engagement_id uuid
)
returns table (
  requester_wallet_linked boolean,
  provider_wallet_linked boolean,
  requester_display_name text,
  provider_display_name text,
  requester_near_account_id text,
  provider_near_account_id text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_asn public.assignments%rowtype;
  v_req_name text;
  v_prov_name text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select a.* into v_asn
  from public.engagements e
  join public.assignments a on a.id = e.assignment_id
  where e.id = p_engagement_id;

  if not found then
    raise exception 'engagement not found';
  end if;

  if v_uid is distinct from v_asn.requester_id
    and v_uid is distinct from v_asn.provider_user_id then
    raise exception 'not a participant';
  end if;

  select display_name into v_req_name
  from public.profiles where id = v_asn.requester_id;

  select display_name into v_prov_name
  from public.profiles where id = v_asn.provider_user_id;

  return query
  select
    public.load_linked_near_account(v_asn.requester_id) is not null,
    public.load_linked_near_account(v_asn.provider_user_id) is not null,
    coalesce(v_req_name, 'Requester'),
    coalesce(v_prov_name, 'Provider'),
    public.load_linked_near_account(v_asn.requester_id),
    public.load_linked_near_account(v_asn.provider_user_id);
end;
$$;

revoke all on function public.get_engagement_funding_prerequisites(uuid) from public;
grant execute on function public.get_engagement_funding_prerequisites(uuid) to authenticated;

-- Providers need request title/deadline for Activity → Offers and similar embeds;
-- open rows are only in requests_public; assigned rows use requests_select_assigned_provider.

create or replace function public.user_has_offer_on_request(
  p_request_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.request_responses rr
    join public.provider_profiles pp on pp.id = rr.provider_profile_id
    where rr.request_id = p_request_id
      and pp.user_id = p_user_id
      and rr.status is distinct from 'withdrawn'::public.response_status
  );
$$;

revoke all on function public.user_has_offer_on_request(uuid, uuid) from public;
grant execute on function public.user_has_offer_on_request(uuid, uuid) to authenticated;

drop policy if exists "requests_select_provider_offer" on public.requests;
create policy "requests_select_provider_offer"
  on public.requests for select
  to authenticated
  using (public.user_has_offer_on_request(id, auth.uid()));

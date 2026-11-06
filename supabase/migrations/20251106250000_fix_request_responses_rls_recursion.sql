-- Break infinite RLS recursion: request_responses -> provider_profiles -> request_responses
-- when evaluating policies (e.g. loading Account / profiles with embedded selects).

create or replace function public.is_provider_profile_owner(
  p_provider_profile_id uuid,
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
    from public.provider_profiles pp
    where pp.id = p_provider_profile_id
      and pp.user_id = p_user_id
  );
$$;

revoke all on function public.is_provider_profile_owner(uuid, uuid) from public;
grant execute on function public.is_provider_profile_owner(uuid, uuid) to authenticated;

drop policy if exists "request_responses_select_provider" on public.request_responses;
create policy "request_responses_select_provider"
  on public.request_responses for select
  to authenticated
  using (
    public.is_provider_profile_owner(provider_profile_id, auth.uid())
  );

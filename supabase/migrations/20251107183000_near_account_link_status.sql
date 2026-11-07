-- Check whether a NEAR account can be linked to the current PaidAid user (no PII leak beyond status).

create or replace function public.near_account_link_status(p_near_account_id text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_account text := lower(trim(p_near_account_id));
  v_owner uuid;
begin
  if v_uid is null then
    return 'not_authenticated';
  end if;

  if v_account is null or v_account = '' then
    return 'invalid_account';
  end if;

  if exists (
    select 1
    from public.linked_near_wallets w
    where w.user_id = v_uid
      and w.unlinked_at is null
  ) then
    return 'you_already_linked';
  end if;

  select w.user_id into v_owner
  from public.linked_near_wallets w
  where lower(trim(w.near_account_id)) = v_account
    and w.unlinked_at is null
  limit 1;

  if v_owner is null then
    return 'free';
  end if;
  if v_owner = v_uid then
    return 'linked_to_you';
  end if;
  return 'linked_to_other';
end;
$$;

revoke all on function public.near_account_link_status(text) from public;
grant execute on function public.near_account_link_status(text) to authenticated;

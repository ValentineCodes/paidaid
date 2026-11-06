-- Uploaded profile photo should be the visible avatar; clear legacy avatar_url on confirm.

create or replace function public.confirm_live_profile_photo(p_storage_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  prefix text;
  v_rowcount int;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_storage_path is null or trim(p_storage_path) = '' then
    raise exception 'Invalid path';
  end if;

  prefix := v_uid::text || '/';
  if position(prefix in p_storage_path) <> 1 then
    raise exception 'Invalid storage path';
  end if;

  perform set_config('app.allow_live_photo_profile_update', 'on', true);

  update public.profiles
  set
    live_profile_photo_path = p_storage_path,
    live_profile_photo_captured_at = now(),
    avatar_url = null
  where id = v_uid;

  perform set_config('app.allow_live_photo_profile_update', '', true);

  get diagnostics v_rowcount = row_count;
  if v_rowcount = 0 then
    raise exception 'Profile not found';
  end if;
end;
$$;

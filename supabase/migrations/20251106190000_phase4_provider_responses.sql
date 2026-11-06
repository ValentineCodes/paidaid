-- Phase 4: provider_profiles, request_responses (full), conversations (pre_accept shell),
-- live profile photo bucket + confirm RPC, submit_request_response / withdraw_request_response, RLS.
-- Replaces Phase 2 stub request_responses.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.provider_profile_kind as enum ('human', 'ai');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.conversation_kind as enum ('pre_accept', 'engagement');
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Drop Phase 2 stub (policies on requests/tags/photos reference this table)
-- ---------------------------------------------------------------------------
drop policy if exists "requests_update_own_editable" on public.requests;
drop policy if exists "requests_delete_own_draft" on public.requests;
drop policy if exists "request_tags_modify_via_request" on public.request_tags;
drop policy if exists "request_tags_delete_via_request" on public.request_tags;
drop policy if exists "request_photos_insert_via_request" on public.request_photos;
drop policy if exists "request_photos_delete_via_request" on public.request_photos;

create policy "requests_update_own_editable"
  on public.requests for update
  to authenticated
  using (
    auth.uid() = requester_id
    and status in ('draft', 'open')
    and first_response_at is null
    and (expires_at is null or expires_at > now())
  )
  with check (
    auth.uid() = requester_id
    and status in ('draft', 'open')
    and first_response_at is null
    and (expires_at is null or expires_at > now())
  );

create policy "requests_delete_own_draft"
  on public.requests for delete
  to authenticated
  using (
    auth.uid() = requester_id
    and status = 'draft'
    and first_response_at is null
  );

create policy "request_tags_modify_via_request"
  on public.request_tags for insert
  to authenticated
  with check (
    exists (
      select 1 from public.requests r
      where r.id = request_tags.request_id
        and r.requester_id = auth.uid()
        and r.status in ('draft', 'open')
        and r.first_response_at is null
    )
  );

create policy "request_tags_delete_via_request"
  on public.request_tags for delete
  to authenticated
  using (
    exists (
      select 1 from public.requests r
      where r.id = request_tags.request_id
        and r.requester_id = auth.uid()
        and r.status in ('draft', 'open')
        and r.first_response_at is null
    )
  );

create policy "request_photos_insert_via_request"
  on public.request_photos for insert
  to authenticated
  with check (
    exists (
      select 1 from public.requests r
      where r.id = request_photos.request_id
        and r.requester_id = auth.uid()
        and r.status in ('draft', 'open')
        and r.first_response_at is null
    )
  );

create policy "request_photos_delete_via_request"
  on public.request_photos for delete
  to authenticated
  using (
    exists (
      select 1 from public.requests r
      where r.id = request_photos.request_id
        and r.requester_id = auth.uid()
        and r.status in ('draft', 'open')
        and r.first_response_at is null
    )
  );

drop trigger if exists request_responses_touch_first on public.request_responses;
drop trigger if exists request_responses_set_updated_at on public.request_responses;
drop table if exists public.request_responses;

-- ---------------------------------------------------------------------------
-- provider_profiles (lazy; created inside submit_request_response)
-- ---------------------------------------------------------------------------
create table public.provider_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  headline text,
  kind public.provider_profile_kind not null default 'human',
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_profiles_headline_len check (
    headline is null or char_length(trim(headline)) <= 160
  )
);

create index if not exists provider_profiles_user_id on public.provider_profiles (user_id);

create trigger provider_profiles_set_updated_at
  before update on public.provider_profiles
  for each row execute function public.set_profiles_updated_at();

comment on table public.provider_profiles is 'Lazy provider profile; created on first response attempt.';

-- ---------------------------------------------------------------------------
-- request_responses
-- ---------------------------------------------------------------------------
create table public.request_responses (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  provider_profile_id uuid not null references public.provider_profiles (id) on delete restrict,
  message text,
  proposed_amount numeric(78, 0) not null,
  proposed_asset_id uuid not null references public.assets (id),
  status public.response_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint request_responses_message_len check (
    message is null or char_length(message) <= 2000
  ),
  constraint request_responses_proposed_positive check (proposed_amount > 0),
  constraint request_responses_whole_amount check (trunc(proposed_amount) = proposed_amount)
);

create unique index if not exists request_responses_one_pending_per_provider
  on public.request_responses (request_id, provider_profile_id)
  where status = 'pending';

create unique index if not exists request_responses_one_accepted_per_request
  on public.request_responses (request_id)
  where status = 'accepted';

create index if not exists request_responses_request_id on public.request_responses (request_id);
create index if not exists request_responses_provider_profile_id on public.request_responses (provider_profile_id);

create trigger request_responses_set_updated_at
  before update on public.request_responses
  for each row execute function public.set_profiles_updated_at();

create or replace function public.touch_request_first_response()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.requests r
  set first_response_at = coalesce(r.first_response_at, now())
  where r.id = new.request_id;
  return new;
end;
$$;

drop trigger if exists request_responses_touch_first on public.request_responses;
create trigger request_responses_touch_first
  after insert on public.request_responses
  for each row execute function public.touch_request_first_response();

-- ---------------------------------------------------------------------------
-- conversations (pre_accept lobby — no messages in Phase 4)
-- ---------------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  kind public.conversation_kind not null,
  response_id uuid references public.request_responses (id) on delete cascade,
  engagement_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_pre_accept_requires_response check (
    kind <> 'pre_accept' or response_id is not null
  ),
  constraint conversations_phase4_no_engagement_rows check (kind <> 'engagement')
);

create unique index if not exists conversations_unique_pre_accept
  on public.conversations (request_id, response_id)
  where kind = 'pre_accept';

create index if not exists conversations_request_id on public.conversations (request_id);

create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_profiles_updated_at();

-- ---------------------------------------------------------------------------
-- Storage: live profile photos (must be under auth uid prefix)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('live-profile-photos', 'live-profile-photos', false)
on conflict (id) do nothing;

drop policy if exists "live_profile_photos_storage_insert" on storage.objects;
create policy "live_profile_photos_storage_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'live-profile-photos'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "live_profile_photos_storage_select_own" on storage.objects;
create policy "live_profile_photos_storage_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'live-profile-photos'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "live_profile_photos_storage_select_requester" on storage.objects;
create policy "live_profile_photos_storage_select_requester"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'live-profile-photos'
    and exists (
      select 1
      from public.profiles p
      join public.provider_profiles pp on pp.user_id = p.id
      join public.request_responses rr on rr.provider_profile_id = pp.id
      join public.requests r on r.id = rr.request_id
      where p.live_profile_photo_path = name
        and r.requester_id = auth.uid()
    )
  );

drop policy if exists "live_profile_photos_storage_update" on storage.objects;
create policy "live_profile_photos_storage_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'live-profile-photos'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "live_profile_photos_storage_delete" on storage.objects;
create policy "live_profile_photos_storage_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'live-profile-photos'
    and split_part(name, '/', 1) = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- RLS: provider_profiles
-- ---------------------------------------------------------------------------
alter table public.provider_profiles enable row level security;

drop policy if exists "provider_profiles_select_own" on public.provider_profiles;
create policy "provider_profiles_select_own"
  on public.provider_profiles for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "provider_profiles_select_as_requester" on public.provider_profiles;
create policy "provider_profiles_select_as_requester"
  on public.provider_profiles for select
  to authenticated
  using (
    exists (
      select 1
      from public.request_responses rr
      join public.requests r on r.id = rr.request_id
      where rr.provider_profile_id = provider_profiles.id
        and r.requester_id = auth.uid()
    )
  );

drop policy if exists "provider_profiles_no_insert" on public.provider_profiles;
create policy "provider_profiles_no_insert"
  on public.provider_profiles for insert
  to authenticated
  with check (false);

drop policy if exists "provider_profiles_no_update" on public.provider_profiles;
create policy "provider_profiles_no_update"
  on public.provider_profiles for update
  to authenticated
  using (false)
  with check (false);

-- ---------------------------------------------------------------------------
-- RLS: request_responses
-- ---------------------------------------------------------------------------
alter table public.request_responses enable row level security;

drop policy if exists "request_responses_select_requester" on public.request_responses;
drop policy if exists "request_responses_select_provider" on public.request_responses;
drop policy if exists "request_responses_no_direct_write" on public.request_responses;
drop policy if exists "request_responses_no_direct_update" on public.request_responses;
drop policy if exists "request_responses_no_direct_delete" on public.request_responses;

create policy "request_responses_select_requester"
  on public.request_responses for select
  to authenticated
  using (
    exists (
      select 1 from public.requests r
      where r.id = request_responses.request_id
        and r.requester_id = auth.uid()
    )
  );

create policy "request_responses_select_provider"
  on public.request_responses for select
  to authenticated
  using (
    exists (
      select 1 from public.provider_profiles pp
      where pp.id = request_responses.provider_profile_id
        and pp.user_id = auth.uid()
    )
  );

create policy "request_responses_no_direct_insert"
  on public.request_responses for insert
  to authenticated
  with check (false);

create policy "request_responses_no_direct_update"
  on public.request_responses for update
  to authenticated
  using (false)
  with check (false);

create policy "request_responses_no_direct_delete"
  on public.request_responses for delete
  to authenticated
  using (false);

-- ---------------------------------------------------------------------------
-- RLS: conversations
-- ---------------------------------------------------------------------------
alter table public.conversations enable row level security;

drop policy if exists "conversations_select_participants" on public.conversations;
create policy "conversations_select_participants"
  on public.conversations for select
  to authenticated
  using (
    exists (
      select 1 from public.requests r
      where r.id = conversations.request_id
        and r.requester_id = auth.uid()
    )
    or (
      kind = 'pre_accept'
      and response_id is not null
      and exists (
        select 1 from public.request_responses rr
        join public.provider_profiles pp on pp.id = rr.provider_profile_id
        where rr.id = conversations.response_id
          and pp.user_id = auth.uid()
      )
    )
  );

drop policy if exists "conversations_no_insert" on public.conversations;
create policy "conversations_no_insert"
  on public.conversations for insert
  to authenticated
  with check (false);

drop policy if exists "conversations_no_update" on public.conversations;
create policy "conversations_no_update"
  on public.conversations for update
  to authenticated
  using (false)
  with check (false);

grant select on public.provider_profiles to authenticated;
grant select on public.request_responses to authenticated;
grant select on public.conversations to authenticated;

-- ---------------------------------------------------------------------------
-- profiles: requester may read provider rows for their request responses
-- ---------------------------------------------------------------------------
drop policy if exists "profiles_select_requester_viewing_responders" on public.profiles;
create policy "profiles_select_requester_viewing_responders"
  on public.profiles for select
  to authenticated
  using (
    exists (
      select 1
      from public.request_responses rr
      join public.requests r on r.id = rr.request_id
      join public.provider_profiles pp on pp.id = rr.provider_profile_id
      where pp.user_id = profiles.id
        and r.requester_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- confirm_live_profile_photo (after client uploads to live-profile-photos)
-- ---------------------------------------------------------------------------
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

  update public.profiles
  set
    live_profile_photo_path = p_storage_path,
    live_profile_photo_captured_at = now()
  where id = v_uid;

  get diagnostics v_rowcount = row_count;
  if v_rowcount = 0 then
    raise exception 'Profile not found';
  end if;
end;
$$;

revoke all on function public.confirm_live_profile_photo(text) from public;
grant execute on function public.confirm_live_profile_photo(text) to authenticated;

-- ---------------------------------------------------------------------------
-- submit_request_response
-- ---------------------------------------------------------------------------
create or replace function public.submit_request_response(
  p_request_id uuid,
  p_message text,
  p_proposed_amount numeric,
  p_headline text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.requests%rowtype;
  v_cfg boolean;
  v_pp_id uuid;
  v_pp_record public.provider_profiles%rowtype;
  v_decimals smallint;
  v_factor numeric;
  v_response_id uuid := gen_random_uuid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_req from public.requests where id = p_request_id for update;
  if not found then
    raise exception 'Request not found';
  end if;

  if v_req.requester_id = v_uid then
    raise exception 'Cannot respond to your own request';
  end if;

  if v_req.status <> 'open' then
    raise exception 'Request is not open';
  end if;

  if v_req.expires_at is not null and v_req.expires_at <= now() then
    raise exception 'Request has expired';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_uid
      and p.live_profile_photo_path is not null
      and p.live_profile_photo_captured_at is not null
  ) then
    raise exception 'Live profile photo required before responding';
  end if;

  select allow_cross_asset_responses into v_cfg from public.app_config where id = 1;
  if coalesce(v_cfg, false) then
    raise exception 'Cross-asset responses are disabled';
  end if;

  select * into v_pp_record from public.provider_profiles where user_id = v_uid;
  if not found then
    insert into public.provider_profiles (user_id, headline, kind)
    values (
      v_uid,
      nullif(trim(coalesce(p_headline, '')), ''),
      'human'
    )
    returning id into v_pp_id;
  else
    v_pp_id := v_pp_record.id;
    if v_pp_record.kind is distinct from 'human' then
      raise exception 'Only human providers may respond in V1';
    end if;
    if p_headline is not null and trim(p_headline) <> '' then
      update public.provider_profiles
      set headline = nullif(trim(p_headline), ''), updated_at = now()
      where id = v_pp_id and user_id = v_uid;
    end if;
  end if;

  if exists (
    select 1 from public.request_responses rr
    where rr.request_id = p_request_id
      and rr.provider_profile_id = v_pp_id
      and rr.status = 'pending'
  ) then
    raise exception 'You already have a pending response on this request';
  end if;

  if p_proposed_amount is null or p_proposed_amount <= 0 then
    raise exception 'Proposed amount must be positive';
  end if;
  if trunc(p_proposed_amount) <> p_proposed_amount then
    raise exception 'Proposed amount must be whole-number smallest units';
  end if;

  select decimals into v_decimals from public.assets where id = v_req.budget_asset_id;
  if v_decimals is null then
    raise exception 'Invalid request asset';
  end if;

  v_factor := 10 ^ v_decimals::int;
  if p_proposed_amount % v_factor <> 0 then
    raise exception 'Proposed amount precision must match the request asset';
  end if;

  insert into public.request_responses (
    id,
    request_id,
    provider_profile_id,
    message,
    proposed_amount,
    proposed_asset_id,
    status
  ) values (
    v_response_id,
    p_request_id,
    v_pp_id,
    nullif(trim(coalesce(p_message, '')), ''),
    p_proposed_amount,
    v_req.budget_asset_id,
    'pending'
  );

  insert into public.conversations (request_id, kind, response_id)
  values (p_request_id, 'pre_accept', v_response_id);

  return v_response_id;
end;
$$;

revoke all on function public.submit_request_response(uuid, text, numeric, text) from public;
grant execute on function public.submit_request_response(uuid, text, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- withdraw_request_response
-- ---------------------------------------------------------------------------
create or replace function public.withdraw_request_response(p_response_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rowcount int;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  update public.request_responses rr
  set status = 'withdrawn', updated_at = now()
  from public.provider_profiles pp
  where rr.id = p_response_id
    and rr.provider_profile_id = pp.id
    and pp.user_id = v_uid
    and rr.status = 'pending';

  get diagnostics v_rowcount = row_count;
  if v_rowcount = 0 then
    raise exception 'Cannot withdraw this response';
  end if;
end;
$$;

revoke all on function public.withdraw_request_response(uuid) from public;
grant execute on function public.withdraw_request_response(uuid) to authenticated;

-- Align add_request_photos edit lock with first_response_at (historical responses, not only pending)
create or replace function public.add_request_photos(
  p_request_id uuid,
  p_paths text[],
  p_mime_types text[],
  p_byte_sizes bigint[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  n int;
  i int;
  v_path text;
  v_mime text;
  v_size bigint;
  prefix text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_paths is null or cardinality(p_paths) = 0 then
    raise exception 'No paths';
  end if;

  n := cardinality(p_paths);
  if cardinality(p_mime_types) <> n or cardinality(p_byte_sizes) <> n then
    raise exception 'Mismatched photo arrays';
  end if;

  if not exists (
    select 1 from public.requests r
    where r.id = p_request_id
      and r.requester_id = v_uid
      and r.status in ('draft', 'open')
      and r.first_response_at is null
  ) then
    raise exception 'Cannot attach photos to this request';
  end if;

  prefix := v_uid::text || '/';

  for i in 1..n loop
    v_path := p_paths[i];
    v_mime := p_mime_types[i];
    v_size := p_byte_sizes[i];

    if v_path is null or v_path = '' then
      raise exception 'Invalid path';
    end if;
    if position(prefix in v_path) <> 1 then
      raise exception 'Invalid storage path';
    end if;
    if v_mime is null or v_mime not in ('image/jpeg', 'image/png', 'image/webp', 'image/gif') then
      raise exception 'Invalid mime type';
    end if;
    if v_size is null or v_size <= 0 or v_size > 10485760 then
      raise exception 'Invalid file size';
    end if;

    insert into public.request_photos (request_id, storage_path, mime_type, byte_size, sort_order)
    values (p_request_id, v_path, v_mime, v_size, (i - 1)::smallint);
  end loop;
end;
$$;

revoke all on function public.add_request_photos(uuid, text[], text[], bigint[]) from public;
grant execute on function public.add_request_photos(uuid, text[], text[], bigint[]) to authenticated;

-- Phase 2: assets, app_config, tags (with categories), requests, request_tags, request_photos,
-- requests_public view, RLS, storage bucket for request photos.
-- Depends on: 20251106120000_phase1_profiles.sql

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.asset_standard as enum ('native', 'nep141');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.request_status as enum ('draft', 'open', 'assigned', 'completed', 'expired');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.timing_type as enum ('immediate', 'scheduled');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.location_kind as enum ('unspecified', 'online', 'in_person');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.tag_category as enum (
    'repairs_trades',
    'home',
    'cars_transport',
    'errands',
    'food_cooking',
    'others'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.response_status as enum ('pending', 'withdrawn', 'accepted', 'rejected');
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- assets
-- ---------------------------------------------------------------------------
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  chain_id text not null,
  asset_standard public.asset_standard not null,
  native_reference text,
  token_contract_id text,
  symbol text not null,
  decimals smallint not null,
  canonical_asset_key text not null unique,
  created_at timestamptz not null default now(),
  constraint assets_native_check check (
    (asset_standard = 'native' and native_reference is not null and token_contract_id is null)
    or (asset_standard = 'nep141' and token_contract_id is not null and native_reference is null)
  ),
  constraint assets_decimals_nonneg check (decimals >= 0 and decimals <= 128)
);

comment on table public.assets is 'NEAR ecosystem asset metadata for indicative budgets (not funded balances).';

-- ---------------------------------------------------------------------------
-- app_config singleton
-- ---------------------------------------------------------------------------
create table if not exists public.app_config (
  id smallint primary key default 1 check (id = 1),
  allow_cross_asset_responses boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.app_config (id) values (1)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- tags (predefined catalogue)
-- ---------------------------------------------------------------------------
create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  category public.tag_category not null,
  sort_order int not null default 0
);

create index if not exists tags_category_sort on public.tags (category, sort_order);

-- ---------------------------------------------------------------------------
-- requests
-- ---------------------------------------------------------------------------
create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  description text not null,
  status public.request_status not null default 'draft',
  timing_type public.timing_type not null,
  scheduled_at timestamptz,
  deadline_at timestamptz,
  expires_at timestamptz,
  budget_amount numeric(78, 0) not null,
  budget_asset_id uuid not null references public.assets (id),
  location_label text,
  location_kind public.location_kind not null default 'unspecified',
  location_structured jsonb,
  published_at timestamptz,
  first_response_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint requests_title_len check (char_length(trim(title)) >= 3 and char_length(trim(title)) <= 50),
  constraint requests_description_len check (char_length(trim(description)) >= 1 and char_length(description) <= 1000),
  constraint requests_timing_scheduled check (
    (timing_type = 'scheduled' and scheduled_at is not null)
    or (timing_type = 'immediate' and scheduled_at is null)
  ),
  constraint requests_budget_positive check (budget_amount > 0),
  constraint requests_location_online_ok check (
    location_kind <> 'in_person'
    or location_label is not null
  )
);

create index if not exists requests_status_published_at
  on public.requests (status, published_at desc nulls last);

create index if not exists requests_expires_open
  on public.requests (expires_at)
  where status = 'open';

create trigger requests_set_updated_at
  before update on public.requests
  for each row execute function public.set_profiles_updated_at();

-- ---------------------------------------------------------------------------
-- request_responses (minimal stub for first_response_at / edit lock; Phase 4+ fills RPC)
-- ---------------------------------------------------------------------------
create table if not exists public.request_responses (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  provider_user_id uuid not null references public.profiles (id) on delete restrict,
  status public.response_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists request_responses_request_id on public.request_responses (request_id);

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

alter table public.request_responses enable row level security;
-- No select/insert policies until response RPC ships (table exists for lock semantics + future phases).

-- ---------------------------------------------------------------------------
-- request_tags (max 3 per request)
-- ---------------------------------------------------------------------------
create table if not exists public.request_tags (
  request_id uuid not null references public.requests (id) on delete cascade,
  tag_id uuid not null references public.tags (id),
  primary key (request_id, tag_id)
);

create index if not exists request_tags_tag_id on public.request_tags (tag_id);

create or replace function public.enforce_request_tag_max_three()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  cnt int;
begin
  select count(*) into cnt from public.request_tags where request_id = new.request_id;
  if cnt >= 3 then
    raise exception 'A request can have at most 3 tags';
  end if;
  return new;
end;
$$;

drop trigger if exists request_tags_max_three on public.request_tags;
create trigger request_tags_max_three
  before insert on public.request_tags
  for each row execute function public.enforce_request_tag_max_three();

-- ---------------------------------------------------------------------------
-- request_photos (max 5 per request)
-- ---------------------------------------------------------------------------
create table if not exists public.request_photos (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  storage_path text not null,
  sort_order smallint not null default 0,
  mime_type text not null,
  byte_size bigint not null,
  created_at timestamptz not null default now(),
  constraint request_photos_byte_size_positive check (byte_size > 0 and byte_size <= 10485760),
  constraint request_photos_mime_allowed check (
    mime_type in (
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif'
    )
  )
);

create index if not exists request_photos_request on public.request_photos (request_id);

create or replace function public.enforce_request_photo_max_five()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  cnt int;
begin
  select count(*) into cnt from public.request_photos where request_id = new.request_id;
  if cnt >= 5 then
    raise exception 'A request can have at most 5 photos';
  end if;
  return new;
end;
$$;

drop trigger if exists request_photos_max_five on public.request_photos;
create trigger request_photos_max_five
  before insert on public.request_photos
  for each row execute function public.enforce_request_photo_max_five();

-- ---------------------------------------------------------------------------
-- Seed assets (NEAR only; planning-aligned)
-- ---------------------------------------------------------------------------
insert into public.assets (chain_id, asset_standard, native_reference, token_contract_id, symbol, decimals, canonical_asset_key)
values
  (
    'near:localnet',
    'native',
    'near',
    null,
    'NEAR',
    24,
    'near:localnet:native:near'
  ),
  (
    'near:testnet',
    'native',
    'near',
    null,
    'NEAR',
    24,
    'near:testnet:native:near'
  ),
  (
    'near:mainnet',
    'native',
    'near',
    null,
    'NEAR',
    24,
    'near:mainnet:native:near'
  )
on conflict (canonical_asset_key) do nothing;

-- ---------------------------------------------------------------------------
-- Seed tags (Active category structure — compact catalogue)
-- ---------------------------------------------------------------------------
insert into public.tags (slug, label, category, sort_order) values
  ('minor-repairs', 'Minor repairs', 'repairs_trades', 10),
  ('plumbing', 'Plumbing', 'repairs_trades', 20),
  ('electrical', 'Electrical', 'repairs_trades', 30),
  ('cleaning', 'Cleaning', 'home', 10),
  ('moving-help', 'Moving help', 'home', 20),
  ('car-wash', 'Car wash', 'cars_transport', 10),
  ('pickup-dropoff', 'Pickup & drop-off', 'cars_transport', 20),
  ('shopping-run', 'Shopping run', 'errands', 10),
  ('queue-stand-in', 'Queue / stand in', 'errands', 20),
  ('meal-prep', 'Meal prep', 'food_cooking', 10),
  ('general-other', 'General help', 'others', 10)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Public view for open requests (safe columns; no PII)
-- ---------------------------------------------------------------------------
-- View runs with owner privileges; exposes only safe columns (no requester id).
create or replace view public.requests_public as
select
  r.id,
  r.title,
  r.description,
  r.timing_type,
  r.scheduled_at,
  r.deadline_at,
  r.budget_amount,
  r.budget_asset_id,
  r.location_kind,
  r.location_label,
  r.published_at,
  r.created_at,
  coalesce(
    (
      select jsonb_agg(elem)
      from (
        select jsonb_build_object(
          'id', t.id,
          'slug', t.slug,
          'label', t.label,
          'category', t.category
        ) as elem,
        t.sort_order
        from public.request_tags rt
        join public.tags t on t.id = rt.tag_id
        where rt.request_id = r.id
        order by t.sort_order
      ) s
    ),
    '[]'::jsonb
  ) as tags
from public.requests r
where r.status = 'open';

grant select on public.requests_public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.assets enable row level security;
alter table public.app_config enable row level security;
alter table public.tags enable row level security;
alter table public.requests enable row level security;
alter table public.request_tags enable row level security;
alter table public.request_photos enable row level security;

-- assets: everyone authenticated + anon can read
drop policy if exists "assets_select_all" on public.assets;
create policy "assets_select_all"
  on public.assets for select
  to anon, authenticated
  using (true);

drop policy if exists "assets_no_insert" on public.assets;
create policy "assets_no_insert"
  on public.assets for insert
  to anon, authenticated
  with check (false);

drop policy if exists "assets_no_update" on public.assets;
create policy "assets_no_update"
  on public.assets for update
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists "assets_no_delete" on public.assets;
create policy "assets_no_delete"
  on public.assets for delete
  to anon, authenticated
  using (false);

-- app_config: read-only for authenticated + anon
drop policy if exists "app_config_select" on public.app_config;
create policy "app_config_select"
  on public.app_config for select
  to anon, authenticated
  using (true);

drop policy if exists "app_config_no_insert" on public.app_config;
create policy "app_config_no_insert"
  on public.app_config for insert
  to anon, authenticated
  with check (false);

drop policy if exists "app_config_no_update" on public.app_config;
create policy "app_config_no_update"
  on public.app_config for update
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists "app_config_no_delete" on public.app_config;
create policy "app_config_no_delete"
  on public.app_config for delete
  to anon, authenticated
  using (false);

-- tags: read-only catalogue
drop policy if exists "tags_select_all" on public.tags;
create policy "tags_select_all"
  on public.tags for select
  to anon, authenticated
  using (true);

drop policy if exists "tags_no_insert" on public.tags;
create policy "tags_no_insert"
  on public.tags for insert
  to anon, authenticated
  with check (false);

drop policy if exists "tags_no_update" on public.tags;
create policy "tags_no_update"
  on public.tags for update
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists "tags_no_delete" on public.tags;
create policy "tags_no_delete"
  on public.tags for delete
  to anon, authenticated
  using (false);

-- requests (inserts only via create_request RPC; direct insert not granted)
drop policy if exists "requests_insert_own" on public.requests;

drop policy if exists "requests_select_own" on public.requests;
create policy "requests_select_own"
  on public.requests for select
  to authenticated
  using (auth.uid() = requester_id);

drop policy if exists "requests_update_own_editable" on public.requests;
create policy "requests_update_own_editable"
  on public.requests for update
  to authenticated
  using (
    auth.uid() = requester_id
    and status in ('draft', 'open')
    and not exists (select 1 from public.request_responses rr where rr.request_id = requests.id)
    and (expires_at is null or expires_at > now())
  )
  with check (
    auth.uid() = requester_id
    and status in ('draft', 'open')
    and not exists (select 1 from public.request_responses rr where rr.request_id = requests.id)
    and (expires_at is null or expires_at > now())
  );

drop policy if exists "requests_delete_own_draft" on public.requests;
create policy "requests_delete_own_draft"
  on public.requests for delete
  to authenticated
  using (
    auth.uid() = requester_id
    and status = 'draft'
    and not exists (select 1 from public.request_responses rr where rr.request_id = requests.id)
  );

-- request_tags: inherit request ownership
drop policy if exists "request_tags_select_via_request" on public.request_tags;
create policy "request_tags_select_via_request"
  on public.request_tags for select
  to authenticated
  using (
    exists (
      select 1 from public.requests r
      where r.id = request_tags.request_id
        and r.requester_id = auth.uid()
    )
  );

drop policy if exists "request_tags_modify_via_request" on public.request_tags;
create policy "request_tags_modify_via_request"
  on public.request_tags for insert
  to authenticated
  with check (
    exists (
      select 1 from public.requests r
      where r.id = request_tags.request_id
        and r.requester_id = auth.uid()
        and r.status in ('draft', 'open')
        and not exists (select 1 from public.request_responses rr where rr.request_id = r.id)
    )
  );

drop policy if exists "request_tags_delete_via_request" on public.request_tags;
create policy "request_tags_delete_via_request"
  on public.request_tags for delete
  to authenticated
  using (
    exists (
      select 1 from public.requests r
      where r.id = request_tags.request_id
        and r.requester_id = auth.uid()
        and r.status in ('draft', 'open')
        and not exists (select 1 from public.request_responses rr where rr.request_id = r.id)
    )
  );

-- request_photos
drop policy if exists "request_photos_select_via_request" on public.request_photos;
create policy "request_photos_select_via_request"
  on public.request_photos for select
  to authenticated
  using (
    exists (
      select 1 from public.requests r
      where r.id = request_photos.request_id
        and r.requester_id = auth.uid()
    )
  );

drop policy if exists "request_photos_insert_via_request" on public.request_photos;
create policy "request_photos_insert_via_request"
  on public.request_photos for insert
  to authenticated
  with check (
    exists (
      select 1 from public.requests r
      where r.id = request_photos.request_id
        and r.requester_id = auth.uid()
        and r.status in ('draft', 'open')
        and not exists (select 1 from public.request_responses rr where rr.request_id = r.id)
    )
  );

drop policy if exists "request_photos_delete_via_request" on public.request_photos;
create policy "request_photos_delete_via_request"
  on public.request_photos for delete
  to authenticated
  using (
    exists (
      select 1 from public.requests r
      where r.id = request_photos.request_id
        and r.requester_id = auth.uid()
        and r.status in ('draft', 'open')
        and not exists (select 1 from public.request_responses rr where rr.request_id = r.id)
    )
  );

-- Open requests: safe columns only via requests_public (invoker RLS). Do not grant broad SELECT on requests
-- for open rows — that would expose requester_id. Invokers must use the view for public browse.

revoke select on public.requests from anon;

drop policy if exists "requests_select_open_anon" on public.requests;
drop policy if exists "requests_select_open_authenticated" on public.requests;

-- request_tags / request_photos visible for open requests to authenticated (for future); for Phase 2 only owner policies above.
-- Public tag labels on open requests: via RPC or view later; Phase 2 composer only.

-- ---------------------------------------------------------------------------
-- Storage: request-photos bucket
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('request-photos', 'request-photos', false)
on conflict (id) do nothing;

-- Users upload/read/delete only under their user id prefix
drop policy if exists "request_photos_storage_insert" on storage.objects;
create policy "request_photos_storage_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'request-photos'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "request_photos_storage_select" on storage.objects;
create policy "request_photos_storage_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'request-photos'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "request_photos_storage_update" on storage.objects;
create policy "request_photos_storage_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'request-photos'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "request_photos_storage_delete" on storage.objects;
create policy "request_photos_storage_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'request-photos'
    and split_part(name, '/', 1) = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- Transactional create + publish RPC
-- ---------------------------------------------------------------------------
create or replace function public.create_request(
  p_title text,
  p_description text,
  p_timing_type public.timing_type,
  p_scheduled_at timestamptz,
  p_deadline_at timestamptz,
  p_expires_at timestamptz,
  p_budget_amount numeric,
  p_budget_asset_id uuid,
  p_location_kind public.location_kind,
  p_location_label text,
  p_location_structured jsonb,
  p_tag_ids uuid[],
  p_publish boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_req_id uuid := gen_random_uuid();
  v_status public.request_status;
  v_tag uuid;
  v_tag_count int;
  v_tag_ids uuid[];
  v_decimals smallint;
  v_factor numeric;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_budget_amount is null or p_budget_amount <= 0 then
    raise exception 'Budget must be a positive amount';
  end if;

  if trunc(p_budget_amount) <> p_budget_amount then
    raise exception 'Budget must be a whole number of smallest units';
  end if;

  if p_tag_ids is not null and cardinality(p_tag_ids) > 0 then
    select coalesce(array_agg(distinct x), '{}')
    into v_tag_ids
    from unnest(p_tag_ids) as t(x);

    v_tag_count := cardinality(v_tag_ids);
    if v_tag_count > 3 then
      raise exception 'At most 3 tags';
    end if;
    foreach v_tag in array v_tag_ids loop
      if not exists (select 1 from public.tags tag where tag.id = v_tag) then
        raise exception 'Invalid tag id';
      end if;
    end loop;
  else
    v_tag_ids := null;
  end if;

  select a.decimals into v_decimals from public.assets a where a.id = p_budget_asset_id;
  if v_decimals is null then
    raise exception 'Invalid asset';
  end if;

  v_factor := 10 ^ v_decimals::int;
  if p_budget_amount % v_factor <> 0 then
    raise exception 'Budget precision must match the selected asset smallest units';
  end if;

  if p_publish then
    v_status := 'open';
  else
    v_status := 'draft';
  end if;

  insert into public.requests (
    id,
    requester_id,
    title,
    description,
    status,
    timing_type,
    scheduled_at,
    deadline_at,
    expires_at,
    budget_amount,
    budget_asset_id,
    location_kind,
    location_label,
    location_structured,
    published_at
  ) values (
    v_req_id,
    v_uid,
    trim(p_title),
    trim(p_description),
    v_status,
    p_timing_type,
    p_scheduled_at,
    p_deadline_at,
    p_expires_at,
    p_budget_amount,
    p_budget_asset_id,
    coalesce(p_location_kind, 'unspecified'),
    nullif(trim(coalesce(p_location_label, '')), ''),
    p_location_structured,
    case when p_publish then now() else null end
  );

  if v_tag_ids is not null then
    foreach v_tag in array v_tag_ids loop
      insert into public.request_tags (request_id, tag_id) values (v_req_id, v_tag);
    end loop;
  end if;

  return v_req_id;
end;
$$;

revoke all on function public.create_request(text, text, public.timing_type, timestamptz, timestamptz, timestamptz, numeric, uuid, public.location_kind, text, jsonb, uuid[], boolean) from public;
grant execute on function public.create_request(text, text, public.timing_type, timestamptz, timestamptz, timestamptz, numeric, uuid, public.location_kind, text, jsonb, uuid[], boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Attach photos after create (storage path must be under auth uid prefix)
-- ---------------------------------------------------------------------------
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
      and not exists (select 1 from public.request_responses rr where rr.request_id = r.id)
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

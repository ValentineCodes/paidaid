-- Phase 3: public discovery feed, searchable open requests, public photo read for open listings.
-- Depends on: 20251106153000_phase2_assets_tags_requests.sql

-- ---------------------------------------------------------------------------
-- Public read: first photo on open requests (bucket stays private; path only)
-- ---------------------------------------------------------------------------
drop policy if exists "request_photos_storage_select_open" on storage.objects;
create policy "request_photos_storage_select_open"
  on storage.objects for select
  to anon, authenticated
  using (
    bucket_id = 'request-photos'
    and exists (
      select 1
      from public.request_photos rp
      join public.requests r on r.id = rp.request_id
      where rp.storage_path = name
        and r.status = 'open'
    )
  );

-- ---------------------------------------------------------------------------
-- request_tags: anon can read tag links for open requests (detail/joins)
-- ---------------------------------------------------------------------------
drop policy if exists "request_tags_select_open_public" on public.request_tags;
create policy "request_tags_select_open_public"
  on public.request_tags for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.requests r
      where r.id = request_tags.request_id
        and r.status = 'open'
    )
  );

-- ---------------------------------------------------------------------------
-- Full-text search support for open requests
-- ---------------------------------------------------------------------------
create extension if not exists pg_trgm;

create index if not exists requests_open_title_trgm
  on public.requests using gin (title gin_trgm_ops)
  where status = 'open';

create index if not exists requests_open_description_trgm
  on public.requests using gin (description gin_trgm_ops)
  where status = 'open';

create index if not exists requests_open_budget_asset
  on public.requests (budget_asset_id)
  where status = 'open';

create index if not exists requests_open_location_kind
  on public.requests (location_kind)
  where status = 'open';

-- ---------------------------------------------------------------------------
-- Enriched public view (safe columns + asset display + first photo path)
-- ---------------------------------------------------------------------------
drop view if exists public.requests_public;

create view public.requests_public as
select
  r.id,
  r.title,
  r.description,
  left(r.description, 280) as description_preview,
  r.timing_type,
  r.scheduled_at,
  r.deadline_at,
  r.budget_amount,
  r.budget_asset_id,
  a.symbol as asset_symbol,
  a.decimals as asset_decimals,
  r.location_kind,
  r.location_label,
  r.published_at,
  r.created_at,
  (
    select rp.storage_path
    from public.request_photos rp
    where rp.request_id = r.id
    order by rp.sort_order
    limit 1
  ) as first_photo_path,
  coalesce(
    (
      select jsonb_agg(rp.storage_path order by rp.sort_order)
      from public.request_photos rp
      where rp.request_id = r.id
    ),
    '[]'::jsonb
  ) as photo_paths,
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
join public.assets a on a.id = r.budget_asset_id
where r.status = 'open';

grant select on public.requests_public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Stable keyset listing for discovery (server-side filters)
-- ---------------------------------------------------------------------------
create or replace function public.list_requests_public(
  p_search text default null,
  p_tag_ids uuid[] default null,
  p_category public.tag_category default null,
  p_asset_id uuid default null,
  p_location_kind public.location_kind default null,
  p_limit int default 20,
  p_cursor_published_at timestamptz default null,
  p_cursor_id uuid default null
)
returns table (
  id uuid,
  title text,
  description_preview text,
  timing_type public.timing_type,
  scheduled_at timestamptz,
  deadline_at timestamptz,
  budget_amount numeric,
  budget_asset_id uuid,
  asset_symbol text,
  asset_decimals smallint,
  location_kind public.location_kind,
  location_label text,
  published_at timestamptz,
  tags jsonb,
  first_photo_path text
)
language sql
stable
security definer
set search_path = public
as $$
  with q as (
    select
      r.id,
      r.title,
      r.description,
      left(r.description, 280) as description_preview,
      r.timing_type,
      r.scheduled_at,
      r.deadline_at,
      r.budget_amount,
      r.budget_asset_id,
      a.symbol as asset_symbol,
      a.decimals as asset_decimals,
      r.location_kind,
      r.location_label,
      r.published_at,
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
      ) as tags,
      (
        select rp.storage_path
        from public.request_photos rp
        where rp.request_id = r.id
        order by rp.sort_order
        limit 1
      ) as first_photo_path
    from public.requests r
    join public.assets a on a.id = r.budget_asset_id
    where r.status = 'open'
      and (
        p_search is null
        or trim(p_search) = ''
        or r.title ilike '%' || trim(p_search) || '%'
        or r.description ilike '%' || trim(p_search) || '%'
      )
      and (p_asset_id is null or r.budget_asset_id = p_asset_id)
      and (
        p_location_kind is null
        or r.location_kind = p_location_kind
      )
      and (
        p_category is null
        or exists (
          select 1
          from public.request_tags rt
          join public.tags t on t.id = rt.tag_id
          where rt.request_id = r.id
            and t.category = p_category
        )
      )
      and (
        p_tag_ids is null
        or cardinality(p_tag_ids) = 0
        or not exists (
          select 1
          from unnest(p_tag_ids) as tid(tag_id)
          where not exists (
            select 1 from public.request_tags rtx
            where rtx.request_id = r.id
              and rtx.tag_id = tid.tag_id
          )
        )
      )
      and (
        (p_cursor_published_at is null and p_cursor_id is null)
        or (
          r.published_at < p_cursor_published_at
          or (r.published_at = p_cursor_published_at and r.id < p_cursor_id)
        )
      )
  )
  select
    q.id,
    q.title,
    q.description_preview,
    q.timing_type,
    q.scheduled_at,
    q.deadline_at,
    q.budget_amount,
    q.budget_asset_id,
    q.asset_symbol,
    q.asset_decimals,
    q.location_kind,
    q.location_label,
    q.published_at,
    q.tags,
    q.first_photo_path
  from q
  order by q.published_at desc nulls last, q.id desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

revoke all on function public.list_requests_public(text, uuid[], public.tag_category, uuid, public.location_kind, int, timestamptz, uuid) from public;
grant execute on function public.list_requests_public(text, uuid[], public.tag_category, uuid, public.location_kind, int, timestamptz, uuid) to anon, authenticated;

-- Resolve storage path → open request id for signed redirects (no broad anon SELECT on requests).
create or replace function public.open_request_id_for_photo_path(p_path text)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select r.id
  from public.request_photos rp
  join public.requests r on r.id = rp.request_id
  where rp.storage_path = p_path
    and r.status = 'open'
  limit 1;
$$;

revoke all on function public.open_request_id_for_photo_path(text) from public;
grant execute on function public.open_request_id_for_photo_path(text) to anon, authenticated;

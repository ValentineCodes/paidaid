-- Return budget_amount as text in JSON APIs so yocto-scale NEAR values are not
-- rounded to IEEE floats (e.g. 1e+25) when PostgREST/clients deserialize RPC results.

-- ---------------------------------------------------------------------------
-- Public discovery view: cast numeric → text
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
  r.budget_amount::text as budget_amount,
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
-- Discovery RPC: return budget_amount as text
-- ---------------------------------------------------------------------------
drop function if exists public.list_requests_public(
  text,
  uuid[],
  public.tag_category,
  uuid,
  public.location_kind,
  int,
  timestamptz,
  uuid
);

create function public.list_requests_public(
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
  budget_amount text,
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
      r.budget_amount::text as budget_amount,
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

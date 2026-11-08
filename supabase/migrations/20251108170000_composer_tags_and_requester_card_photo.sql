-- Composer categories (Creative, Design, …) and requester avatar fields for listing cards.

insert into public.tags (slug, label, category, sort_order) values
  ('creative', 'Creative', 'others', 5),
  ('design', 'Design', 'others', 6),
  ('writing', 'Writing', 'others', 7),
  ('photography', 'Photography', 'others', 8)
on conflict (slug) do nothing;

drop function if exists public.request_requester_public_card(uuid);

create function public.request_requester_public_card(p_request_id uuid)
returns table (
  display_name text,
  verified boolean,
  avatar_url text,
  live_profile_photo_path text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    trim(p.display_name)::text as display_name,
    (
      coalesce(nullif(trim(p.avatar_url), ''), '') <> ''
      or p.live_profile_photo_path is not null
    ) as verified,
    nullif(trim(p.avatar_url), '')::text as avatar_url,
    p.live_profile_photo_path
  from public.requests r
  join public.profiles p on p.id = r.requester_id
  where r.id = p_request_id
    and r.status = 'open'
    and r.published_at is not null;
$$;

revoke all on function public.request_requester_public_card(uuid) from public;
grant execute on function public.request_requester_public_card(uuid) to anon, authenticated;

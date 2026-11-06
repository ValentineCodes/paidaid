-- Safe requester display for open, published requests (no requester_id leak on requests table).
create or replace function public.request_requester_public_card(p_request_id uuid)
returns table (
  display_name text,
  verified boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    trim(p.display_name)::text as display_name,
    (
      p.live_profile_photo_path is not null
      and p.live_profile_photo_captured_at is not null
    ) as verified
  from public.requests r
  join public.profiles p on p.id = r.requester_id
  where r.id = p_request_id
    and r.status = 'open'
    and r.published_at is not null;
$$;

revoke all on function public.request_requester_public_card(uuid) from public;
grant execute on function public.request_requester_public_card(uuid) to anon, authenticated;

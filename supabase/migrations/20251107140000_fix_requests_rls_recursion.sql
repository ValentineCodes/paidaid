-- requests_select_conversation_participant referenced conversations; conversations RLS
-- references requests → infinite recursion (e.g. on Account layout queries).

drop policy if exists "requests_select_conversation_participant" on public.requests;

-- Chat thread metadata for participants (no cross-table RLS policy loop).
create or replace function public.get_conversation_request_context(p_conversation_id uuid)
returns table (
  id uuid,
  title text,
  location_kind public.location_kind,
  location_label text,
  timing_type public.timing_type,
  scheduled_at timestamptz,
  requester_id uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_req_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_conversation_participant(p_conversation_id, v_uid) then
    raise exception 'Not a participant in this conversation';
  end if;

  select c.request_id
  into v_req_id
  from public.conversations c
  where c.id = p_conversation_id;

  if v_req_id is null then
    return;
  end if;

  return query
  select
    r.id,
    r.title,
    r.location_kind,
    r.location_label,
    r.timing_type,
    r.scheduled_at,
    r.requester_id
  from public.requests r
  where r.id = v_req_id;
end;
$$;

revoke all on function public.get_conversation_request_context(uuid) from public;
grant execute on function public.get_conversation_request_context(uuid) to authenticated;

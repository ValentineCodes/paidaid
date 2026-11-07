-- Participant-only message history (bypasses messages RLS for authorised callers).
-- Request row access for chat uses get_conversation_request_context (see 20251107140000).
create or replace function public.list_conversation_messages(p_conversation_id uuid)
returns table (
  id uuid,
  conversation_id uuid,
  sender_id uuid,
  kind public.message_kind,
  body text,
  location_lat double precision,
  location_lng double precision,
  location_label text,
  created_at timestamptz,
  updated_at timestamptz,
  message_attachments jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_conversation_participant(p_conversation_id, v_uid) then
    raise exception 'Not a participant in this conversation';
  end if;

  return query
  select
    m.id,
    m.conversation_id,
    m.sender_id,
    m.kind,
    m.body,
    m.location_lat,
    m.location_lng,
    m.location_label,
    m.created_at,
    m.updated_at,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', ma.id,
            'message_id', ma.message_id,
            'storage_path', ma.storage_path,
            'mime_type', ma.mime_type,
            'byte_size', ma.byte_size,
            'sort_order', ma.sort_order,
            'created_at', ma.created_at
          )
          order by ma.sort_order, ma.created_at
        )
        from public.message_attachments ma
        where ma.message_id = m.id
      ),
      '[]'::jsonb
    ) as message_attachments
  from public.messages m
  where m.conversation_id = p_conversation_id
  order by m.created_at asc;
end;
$$;

revoke all on function public.list_conversation_messages(uuid) from public;
grant execute on function public.list_conversation_messages(uuid) to authenticated;

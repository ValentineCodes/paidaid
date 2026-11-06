-- Optional params for send_message (text does not need location args)
create or replace function public.send_message(
  p_conversation_id uuid,
  p_kind public.message_kind,
  p_body text default null,
  p_location_lat double precision default null,
  p_location_lng double precision default null,
  p_location_label text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid := gen_random_uuid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_conversation_participant(p_conversation_id, v_uid) then
    raise exception 'Not a participant in this conversation';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_uid
      and p.live_profile_photo_path is not null
      and p.live_profile_photo_captured_at is not null
  ) then
    raise exception 'Live profile photo required before messaging';
  end if;

  if p_kind = 'text' then
    if p_body is null or trim(p_body) = '' then
      raise exception 'Message body required';
    end if;
    if char_length(p_body) > 8000 then
      raise exception 'Message too long';
    end if;
    insert into public.messages (id, conversation_id, sender_id, kind, body)
    values (v_id, p_conversation_id, v_uid, 'text', p_body);
  elsif p_kind = 'location' then
    if p_location_lat is null or p_location_lng is null then
      raise exception 'Location coordinates required';
    end if;
    if p_location_lat < -90 or p_location_lat > 90 or p_location_lng < -180 or p_location_lng > 180 then
      raise exception 'Invalid coordinates';
    end if;
    insert into public.messages (
      id, conversation_id, sender_id, kind, body,
      location_lat, location_lng, location_label
    )
    values (
      v_id,
      p_conversation_id,
      v_uid,
      'location',
      coalesce(nullif(trim(coalesce(p_location_label, '')), ''), 'Shared location'),
      p_location_lat,
      p_location_lng,
      nullif(trim(coalesce(p_location_label, '')), '')
    );
  else
    raise exception 'Unsupported message kind';
  end if;

  return v_id;
end;
$$;

revoke all on function public.send_message(uuid, public.message_kind, text, double precision, double precision, text) from public;
grant execute on function public.send_message(uuid, public.message_kind, text, double precision, double precision, text) to authenticated;

-- Text messages may have an empty body when attachments are sent without a caption.

alter table public.messages
  drop constraint if exists messages_kind_text;

alter table public.messages
  add constraint messages_kind_text check (
    kind <> 'text'::public.message_kind or body is not null
  );

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
  v_peer uuid;
  v_req_id uuid;
  v_eng_id uuid;
  v_text_body text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_conversation_participant(p_conversation_id, v_uid) then
    raise exception 'Not a participant in this conversation';
  end if;

  if not public.profile_has_usable_photo(v_uid) then
    raise exception 'Add a profile photo (Account settings) before messaging';
  end if;

  select c.request_id, c.engagement_id
  into v_req_id, v_eng_id
  from public.conversations c
  where c.id = p_conversation_id;

  select case
    when c.kind = 'pre_accept'::public.conversation_kind then
      case
        when r.requester_id = v_uid then pp.user_id
        else r.requester_id
      end
    when c.kind = 'engagement'::public.conversation_kind then
      case
        when a.requester_id = v_uid then a.provider_user_id
        else a.requester_id
      end
    else null
  end into v_peer
  from public.conversations c
  join public.requests r on r.id = c.request_id
  left join public.request_responses rr on rr.id = c.response_id
  left join public.provider_profiles pp on pp.id = rr.provider_profile_id
  left join public.engagements e on e.id = c.engagement_id
  left join public.assignments a on a.id = e.assignment_id
  where c.id = p_conversation_id;

  if v_peer is null then
    raise exception 'Could not resolve conversation peer';
  end if;

  if p_kind = 'text' then
    v_text_body := coalesce(p_body, '');
    if char_length(v_text_body) > 8000 then
      raise exception 'Message too long';
    end if;
    insert into public.messages (id, conversation_id, sender_id, kind, body)
    values (v_id, p_conversation_id, v_uid, 'text', v_text_body);
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

  insert into public.notifications (
    user_id,
    kind,
    title,
    body,
    request_id,
    engagement_id,
    conversation_id,
    message_id
  )
  values (
    v_peer,
    'new_message'::public.notification_kind,
    'New message',
    case p_kind
      when 'text'::public.message_kind then
        case
          when nullif(trim(coalesce(p_body, '')), '') is null then 'Attachment'
          else left(trim(p_body), 200)
        end
      else 'Location shared'
    end,
    v_req_id,
    v_eng_id,
    p_conversation_id,
    v_id
  );

  return v_id;
end;
$$;

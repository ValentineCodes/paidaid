-- Profile photos are optional for prototype flows (respond + message).

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
  v_response_id uuid := gen_random_uuid();
  v_responder_near text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  v_responder_near := public.require_auth_linked_near_account();

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

  if not exists (select 1 from public.assets where id = v_req.budget_asset_id) then
    raise exception 'Invalid request asset';
  end if;

  insert into public.request_responses (
    id,
    request_id,
    provider_profile_id,
    message,
    proposed_amount,
    proposed_asset_id,
    status,
    responder_near_account_id
  ) values (
    v_response_id,
    p_request_id,
    v_pp_id,
    nullif(trim(coalesce(p_message, '')), ''),
    p_proposed_amount,
    v_req.budget_asset_id,
    'pending',
    v_responder_near
  );

  insert into public.conversations (request_id, kind, response_id)
  values (p_request_id, 'pre_accept', v_response_id);

  insert into public.notifications (user_id, kind, title, body, request_id, response_id)
  values (
    v_req.requester_id,
    'request_new_response'::public.notification_kind,
    'New response on your request',
    'Someone submitted an offer on one of your requests.',
    p_request_id,
    v_response_id
  );

  return v_response_id;
end;
$$;

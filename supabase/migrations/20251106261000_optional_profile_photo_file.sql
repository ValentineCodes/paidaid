-- Profile photo gate: any uploaded/linked photo counts (not live-camera-only).

create or replace function public.profile_has_usable_photo(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(nullif(trim(p.avatar_url), ''), '') <> ''
    or p.live_profile_photo_path is not null
  from public.profiles p
  where p.id = p_id;
$$;

revoke all on function public.profile_has_usable_photo(uuid) from public;
grant execute on function public.profile_has_usable_photo(uuid) to authenticated;

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
      coalesce(nullif(trim(p.avatar_url), ''), '') <> ''
      or p.live_profile_photo_path is not null
    ) as verified
  from public.requests r
  join public.profiles p on p.id = r.requester_id
  where r.id = p_request_id
    and r.status = 'open'
    and r.published_at is not null;
$$;

-- ---------------------------------------------------------------------------
-- submit_request_response
-- ---------------------------------------------------------------------------
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
  v_decimals smallint;
  v_factor numeric;
  v_response_id uuid := gen_random_uuid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

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

  if not public.profile_has_usable_photo(v_uid) then
    raise exception 'Add a profile photo (Account settings) before responding';
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

  select decimals into v_decimals from public.assets where id = v_req.budget_asset_id;
  if v_decimals is null then
    raise exception 'Invalid request asset';
  end if;

  v_factor := 10 ^ v_decimals::int;
  if p_proposed_amount % v_factor <> 0 then
    raise exception 'Proposed amount precision must match the request asset';
  end if;

  insert into public.request_responses (
    id,
    request_id,
    provider_profile_id,
    message,
    proposed_amount,
    proposed_asset_id,
    status
  ) values (
    v_response_id,
    p_request_id,
    v_pp_id,
    nullif(trim(coalesce(p_message, '')), ''),
    p_proposed_amount,
    v_req.budget_asset_id,
    'pending'
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

-- ---------------------------------------------------------------------------
-- send_message
-- ---------------------------------------------------------------------------
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
      when 'text'::public.message_kind then left(trim(p_body), 200)
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

-- ---------------------------------------------------------------------------
-- submit_delivery
-- ---------------------------------------------------------------------------
create or replace function public.submit_delivery(
  p_engagement_id uuid,
  p_description text,
  p_post_to_chat boolean default false
)
returns table (
  delivery_id uuid,
  chat_message_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_eng public.engagements%rowtype;
  v_asn public.assignments%rowtype;
  v_dlv public.deliveries;
  v_conv_id uuid;
  v_msg uuid;
  v_caption text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_description is null or trim(p_description) = '' then
    raise exception 'Description required';
  end if;
  if char_length(trim(p_description)) > 4000 then
    raise exception 'Description too long';
  end if;

  select * into v_eng from public.engagements where id = p_engagement_id for update;
  if not found then
    raise exception 'Engagement not found';
  end if;
  if v_eng.status <> 'active'::public.engagement_status then
    raise exception 'Engagement not active';
  end if;

  select * into v_asn from public.assignments where id = v_eng.assignment_id;
  if v_asn.provider_user_id is distinct from v_uid then
    raise exception 'Only the assigned provider can submit delivery';
  end if;

  if not public.profile_has_usable_photo(v_uid) then
    raise exception 'Add a profile photo (Account settings) before submitting delivery';
  end if;

  select * into v_dlv from public.deliveries where engagement_id = p_engagement_id;

  if not found then
    insert into public.deliveries (
      engagement_id,
      provider_user_id,
      status,
      description,
      submitted_at
    )
    values (
      p_engagement_id,
      v_uid,
      'pending_review'::public.delivery_status,
      trim(p_description),
      now()
    )
    returning * into v_dlv;
  elsif v_dlv.status = 'revision_requested'::public.delivery_status then
    delete from public.delivery_attachments where delivery_id = v_dlv.id;
    update public.deliveries
    set
      description = trim(p_description),
      status = 'pending_review'::public.delivery_status,
      submitted_at = now()
    where id = v_dlv.id
    returning * into v_dlv;
  elsif v_dlv.status = 'pending_review'::public.delivery_status then
    raise exception 'Delivery already pending review';
  else
    raise exception 'Delivery already finalized';
  end if;

  update public.engagements
  set auto_complete_deadline_at = v_dlv.submitted_at + interval '72 hours'
  where id = p_engagement_id;

  insert into public.notifications (user_id, kind, title, body, request_id, engagement_id)
  values (
    v_asn.requester_id,
    'delivery_submitted'::public.notification_kind,
    'Delivery submitted',
    'The provider submitted work for your review.',
    v_asn.request_id,
    p_engagement_id
  );

  chat_message_id := null;
  if coalesce(p_post_to_chat, false) then
    select c.id into v_conv_id
    from public.conversations c
    where c.engagement_id = p_engagement_id
      and c.kind = 'engagement'::public.conversation_kind;
    if v_conv_id is null then
      raise exception 'No engagement conversation';
    end if;
    v_caption := '[Delivery] ' || left(trim(p_description), 7900);
    insert into public.messages (id, conversation_id, sender_id, kind, body)
    values (gen_random_uuid(), v_conv_id, v_uid, 'text'::public.message_kind, v_caption)
    returning id into v_msg;
    chat_message_id := v_msg;
  end if;

  delivery_id := v_dlv.id;
  return next;
end;
$$;

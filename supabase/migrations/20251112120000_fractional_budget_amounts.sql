-- Allow fractional token budgets (e.g. 0.001 NEAR) stored as smallest-unit integers.

create or replace function public.create_request(
  p_title text,
  p_description text,
  p_timing_type public.timing_type,
  p_scheduled_at timestamptz,
  p_deadline_at timestamptz,
  p_expires_at timestamptz,
  p_budget_amount numeric,
  p_budget_asset_id uuid,
  p_location_kind public.location_kind,
  p_location_label text,
  p_location_structured jsonb,
  p_tag_ids uuid[],
  p_publish boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_req_id uuid := gen_random_uuid();
  v_status public.request_status;
  v_tag uuid;
  v_tag_count int;
  v_tag_ids uuid[];
  v_requester_near text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  v_requester_near := public.require_auth_linked_near_account();

  if p_budget_amount is null or p_budget_amount <= 0 then
    raise exception 'Budget must be a positive amount';
  end if;

  if trunc(p_budget_amount) <> p_budget_amount then
    raise exception 'Budget must be a whole number of smallest units';
  end if;

  if p_tag_ids is not null and cardinality(p_tag_ids) > 0 then
    select coalesce(array_agg(distinct x), '{}')
    into v_tag_ids
    from unnest(p_tag_ids) as t(x);

    v_tag_count := cardinality(v_tag_ids);
    if v_tag_count > 3 then
      raise exception 'At most 3 tags';
    end if;
    foreach v_tag in array v_tag_ids loop
      if not exists (select 1 from public.tags tag where tag.id = v_tag) then
        raise exception 'Invalid tag id';
      end if;
    end loop;
  else
    v_tag_ids := null;
  end if;

  if not exists (select 1 from public.assets a where a.id = p_budget_asset_id) then
    raise exception 'Invalid asset';
  end if;

  if p_publish then
    v_status := 'open';
  else
    v_status := 'draft';
  end if;

  insert into public.requests (
    id,
    requester_id,
    requester_near_account_id,
    title,
    description,
    status,
    timing_type,
    scheduled_at,
    deadline_at,
    expires_at,
    budget_amount,
    budget_asset_id,
    location_kind,
    location_label,
    location_structured,
    published_at
  ) values (
    v_req_id,
    v_uid,
    v_requester_near,
    trim(p_title),
    trim(p_description),
    v_status,
    p_timing_type,
    p_scheduled_at,
    p_deadline_at,
    p_expires_at,
    p_budget_amount,
    p_budget_asset_id,
    coalesce(p_location_kind, 'unspecified'),
    nullif(trim(coalesce(p_location_label, '')), ''),
    p_location_structured,
    case when p_publish then now() else null end
  );

  if v_tag_ids is not null then
    foreach v_tag in array v_tag_ids loop
      insert into public.request_tags (request_id, tag_id) values (v_req_id, v_tag);
    end loop;
  end if;

  return v_req_id;
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

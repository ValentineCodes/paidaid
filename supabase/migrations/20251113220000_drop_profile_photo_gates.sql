-- Profile photos remain optional (see 20251113120000, 20251108180000).
-- 20251113180000 accidentally reintroduced the respond gate on submit_request_response.

create or replace function public.submit_request_response(
  p_request_id uuid,
  p_message text,
  p_proposed_amount numeric,
  p_headline text,
  p_accept_request_milestones boolean default false,
  p_milestone_proposal jsonb default null
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
  v_offer_status public.milestone_offer_status := 'not_applicable';
  v_elem jsonb;
  v_pos smallint;
  v_amount numeric(78, 0);
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
    values (v_uid, nullif(trim(coalesce(p_headline, '')), ''), 'human')
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
    where rr.request_id = p_request_id and rr.provider_profile_id = v_pp_id
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

  if v_req.payment_mode = 'milestones'::public.engagement_payment_mode then
    if p_accept_request_milestones then
      if p_milestone_proposal is not null then
        raise exception 'cannot accept and propose milestones together';
      end if;
      perform public.validate_milestone_schedule_json(
        (
          select jsonb_agg(
            jsonb_build_object(
              'position', m.position,
              'title', m.title,
              'description', m.description,
              'amount', m.amount::text
            ) order by m.position
          )
          from public.request_milestones m
          where m.request_id = p_request_id
        ),
        p_proposed_amount
      );
      v_offer_status := 'accepted_as_proposed';
    elsif p_milestone_proposal is not null then
      perform public.validate_milestone_schedule_json(p_milestone_proposal, p_proposed_amount);
      v_offer_status := 'proposal_pending';
    else
      raise exception 'milestone response requires accept or proposal';
    end if;
  elsif p_accept_request_milestones or p_milestone_proposal is not null then
    raise exception 'milestones not applicable';
  end if;

  insert into public.request_responses (
    id, request_id, provider_profile_id, message, proposed_amount,
    proposed_asset_id, status, responder_near_account_id, milestone_offer_status
  ) values (
    v_response_id, p_request_id, v_pp_id,
    nullif(trim(coalesce(p_message, '')), ''),
    p_proposed_amount, v_req.budget_asset_id, 'pending', v_responder_near,
    v_offer_status
  );

  if v_offer_status = 'proposal_pending' then
    for v_elem in
      select value from jsonb_array_elements(p_milestone_proposal)
      order by (value ->> 'position')::int
    loop
      v_pos := (v_elem ->> 'position')::smallint;
      v_amount := (v_elem ->> 'amount')::numeric(78, 0);
      insert into public.request_response_milestone_proposals (
        response_id, position, title, description, amount
      ) values (
        v_response_id, v_pos, trim(v_elem ->> 'title'),
        coalesce(v_elem ->> 'description', ''), v_amount
      );
    end loop;
  end if;

  insert into public.conversations (request_id, kind, response_id)
  values (p_request_id, 'pre_accept', v_response_id);

  insert into public.notifications (user_id, kind, title, body, request_id, response_id)
  values (
    v_req.requester_id,
    case
      when v_offer_status = 'proposal_pending'::public.milestone_offer_status
      then 'request_new_response'::public.notification_kind
      else 'request_new_response'::public.notification_kind
    end,
    case
      when v_offer_status = 'proposal_pending'::public.milestone_offer_status
      then 'Milestone proposal to review'
      else 'New response on your request'
    end,
    case
      when v_offer_status = 'proposal_pending'::public.milestone_offer_status
      then 'A provider proposed milestone changes on your task.'
      else 'Someone submitted an offer on one of your requests.'
    end,
    p_request_id,
    v_response_id
  );

  return v_response_id;
end;
$$;

revoke all on function public.submit_request_response(
  uuid, text, numeric, text, boolean, jsonb
) from public;
grant execute on function public.submit_request_response(
  uuid, text, numeric, text, boolean, jsonb
) to authenticated;

-- Expire in-flight fund-on-acceptance when an offer is withdrawn or no longer pending.

create or replace function public.expire_active_acceptance_intents_for_response(p_response_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  for v_row in
    select i.id, i.payment_id
    from public.acceptance_funding_intents i
    where i.response_id = p_response_id
      and i.status in (
        'awaiting_wallet'::public.acceptance_funding_intent_status,
        'create_submitted'::public.acceptance_funding_intent_status,
        'fund_submitted'::public.acceptance_funding_intent_status,
        'funding_verified'::public.acceptance_funding_intent_status
      )
    for update of i
  loop
    update public.acceptance_funding_intents
    set
      status = 'expired'::public.acceptance_funding_intent_status,
      last_error = coalesce(last_error, 'response withdrawn'),
      updated_at = now()
    where id = v_row.id;

    if v_row.payment_id is not null then
      update public.engagement_escrow_payments ep
      set
        status = 'failed'::public.engagement_payment_status,
        last_error = coalesce(ep.last_error, 'response withdrawn'),
        updated_at = now()
      where ep.id = v_row.payment_id
        and ep.status is distinct from 'funded'::public.engagement_payment_status;
    end if;
  end loop;
end;
$$;

revoke all on function public.expire_active_acceptance_intents_for_response(uuid) from public;
grant execute on function public.expire_active_acceptance_intents_for_response(uuid) to authenticated;

create or replace function public.expire_stale_acceptance_intents_for_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  for v_row in
    select i.id, i.payment_id
    from public.acceptance_funding_intents i
    join public.request_responses rr on rr.id = i.response_id
    where i.request_id = p_request_id
      and i.status in (
        'awaiting_wallet'::public.acceptance_funding_intent_status,
        'create_submitted'::public.acceptance_funding_intent_status,
        'fund_submitted'::public.acceptance_funding_intent_status,
        'funding_verified'::public.acceptance_funding_intent_status
      )
      and rr.status is distinct from 'pending'::public.response_status
    for update of i
  loop
    update public.acceptance_funding_intents
    set
      status = 'expired'::public.acceptance_funding_intent_status,
      last_error = coalesce(last_error, 'response no longer pending'),
      updated_at = now()
    where id = v_row.id;

    if v_row.payment_id is not null then
      update public.engagement_escrow_payments ep
      set
        status = 'failed'::public.engagement_payment_status,
        last_error = coalesce(ep.last_error, 'response no longer pending'),
        updated_at = now()
      where ep.id = v_row.payment_id
        and ep.status is distinct from 'funded'::public.engagement_payment_status;
    end if;
  end loop;
end;
$$;

revoke all on function public.expire_stale_acceptance_intents_for_request(uuid) from public;
grant execute on function public.expire_stale_acceptance_intents_for_request(uuid) to authenticated;

create or replace function public.withdraw_request_response(p_response_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rowcount int;
  v_req_id uuid;
  v_requester uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select rr.request_id, r.requester_id
  into v_req_id, v_requester
  from public.request_responses rr
  join public.requests r on r.id = rr.request_id
  join public.provider_profiles pp on pp.id = rr.provider_profile_id
  where rr.id = p_response_id
    and pp.user_id = v_uid
    and rr.status = 'pending';

  if v_req_id is null then
    raise exception 'Cannot withdraw this response';
  end if;

  perform public.expire_active_acceptance_intents_for_response(p_response_id);

  update public.request_responses rr
  set status = 'withdrawn', updated_at = now()
  from public.provider_profiles pp
  where rr.id = p_response_id
    and rr.provider_profile_id = pp.id
    and pp.user_id = v_uid
    and rr.status = 'pending';

  get diagnostics v_rowcount = row_count;
  if v_rowcount = 0 then
    raise exception 'Cannot withdraw this response';
  end if;

  insert into public.notifications (
    user_id,
    kind,
    title,
    body,
    request_id,
    response_id
  )
  values (
    v_requester,
    'response_withdrawn'::public.notification_kind,
    'Response withdrawn',
    'A provider withdrew their offer on your request.',
    v_req_id,
    p_response_id
  );
end;
$$;

revoke all on function public.withdraw_request_response(uuid) from public;
grant execute on function public.withdraw_request_response(uuid) to authenticated;

create or replace function public.prepare_acceptance_funding(
  p_request_id uuid,
  p_response_id uuid,
  p_escrow_contract_id text,
  p_chain_id text,
  p_auth_nonce text,
  p_auth_expires_at timestamptz
)
returns public.acceptance_funding_intents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.requests%rowtype;
  v_rr public.request_responses%rowtype;
  v_asset public.assets%rowtype;
  v_pp public.provider_profiles%rowtype;
  v_provider_uid uuid;
  v_requester_near text;
  v_provider_near text;
  v_intent public.acceptance_funding_intents%rowtype;
  v_payment public.engagement_escrow_payments%rowtype;
  v_other public.acceptance_funding_intents%rowtype;
  v_linked_requester text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_escrow_contract_id is null or length(trim(p_escrow_contract_id)) = 0 then
    raise exception 'escrow contract not configured';
  end if;
  if p_auth_nonce is null or char_length(trim(p_auth_nonce)) < 16 then
    raise exception 'invalid auth nonce';
  end if;
  if p_auth_expires_at <= now() then
    raise exception 'authorization already expired';
  end if;

  select * into v_req from public.requests where id = p_request_id for update;
  if not found then
    raise exception 'request not found';
  end if;
  if v_req.requester_id is distinct from v_uid then
    raise exception 'only the requester may accept';
  end if;
  if v_req.expires_at is not null and v_req.expires_at <= now() then
    raise exception 'request expired';
  end if;
  if v_req.status <> 'open'::public.request_status then
    raise exception 'request is not open';
  end if;

  select * into v_rr from public.request_responses where id = p_response_id for update;
  if not found or v_rr.request_id is distinct from p_request_id then
    raise exception 'response not found';
  end if;
  if v_rr.status is distinct from 'pending'::public.response_status then
    raise exception 'response is not pending';
  end if;

  select * into v_pp from public.provider_profiles where id = v_rr.provider_profile_id;
  v_provider_uid := v_pp.user_id;
  if v_provider_uid = v_req.requester_id then
    raise exception 'invalid provider';
  end if;

  select r.requester_near, r.provider_near
  into v_requester_near, v_provider_near
  from public.resolve_participant_near_accounts(v_req, v_rr, v_provider_uid) r;

  v_linked_requester := public.load_linked_near_account(v_uid);
  if v_req.requester_near_account_id is not null then
    if v_linked_requester is null
      or lower(trim(v_linked_requester)) is distinct from v_requester_near then
      raise exception 'requester wallet must match the wallet used when this request was created';
    end if;
  end if;

  perform public.expire_stale_acceptance_intents_for_request(p_request_id);

  select * into v_other
  from public.acceptance_funding_intents i
  where i.request_id = p_request_id
    and i.status in (
      'awaiting_wallet', 'create_submitted', 'fund_submitted', 'funding_verified'
    )
  for update;

  if found then
    if v_other.response_id <> p_response_id then
      raise exception 'another acceptance is in progress';
    end if;
    if v_other.status in ('create_submitted', 'fund_submitted') then
      raise exception 'funding already in progress';
    end if;
    return v_other;
  end if;

  select * into v_asset from public.assets where id = v_rr.proposed_asset_id;
  if not found or v_asset.enabled is distinct from true or v_asset.chain_id <> p_chain_id then
    raise exception 'asset invalid for network';
  end if;

  insert into public.acceptance_funding_intents (
    request_id, response_id, requester_user_id,
    planned_assignment_id, planned_engagement_id,
    chain_id, escrow_contract_id, asset_id, amount,
    requester_near_account_id, provider_user_id, provider_near_account_id,
    auth_nonce, auth_expires_at, expires_at, status
  ) values (
    p_request_id, p_response_id, v_uid,
    gen_random_uuid(), gen_random_uuid(),
    p_chain_id, p_escrow_contract_id, v_rr.proposed_asset_id, v_rr.proposed_amount,
    v_requester_near, v_provider_uid, v_provider_near,
    trim(p_auth_nonce), p_auth_expires_at, p_auth_expires_at, 'awaiting_wallet'
  ) returning * into v_intent;

  insert into public.engagement_escrow_payments (
    engagement_id, acceptance_intent_id,
    request_id, response_id,
    chain_id, escrow_contract_id, asset_id, amount,
    requester_user_id, requester_near_account_id,
    provider_user_id, provider_near_account_id, status
  ) values (
    null, v_intent.id,
    p_request_id, p_response_id,
    p_chain_id, p_escrow_contract_id, v_rr.proposed_asset_id, v_rr.proposed_amount,
    v_uid, v_requester_near,
    v_provider_uid, v_provider_near, 'prepared'
  ) returning * into v_payment;

  update public.acceptance_funding_intents
  set payment_id = v_payment.id, updated_at = now()
  where id = v_intent.id
  returning * into v_intent;

  return v_intent;
end;
$$;

revoke all on function public.prepare_acceptance_funding(uuid, uuid, text, text, text, timestamptz) from public;
grant execute on function public.prepare_acceptance_funding(uuid, uuid, text, text, text, timestamptz) to authenticated;

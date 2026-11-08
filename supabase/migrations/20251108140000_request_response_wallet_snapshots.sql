-- Immutable NEAR wallet snapshots on requests and responses (Phase 4).

-- ---------------------------------------------------------------------------
-- Columns (legacy rows remain nullable — no backfill)
-- ---------------------------------------------------------------------------
alter table public.requests
  add column if not exists requester_near_account_id text;

alter table public.request_responses
  add column if not exists responder_near_account_id text;

alter table public.assignments
  add column if not exists requester_near_account_id text,
  add column if not exists provider_near_account_id text;

alter table public.requests
  drop constraint if exists requests_requester_near_account_format;

alter table public.requests
  add constraint requests_requester_near_account_format check (
    requester_near_account_id is null
    or (
      char_length(trim(requester_near_account_id)) >= 2
      and char_length(trim(requester_near_account_id)) <= 64
      and requester_near_account_id ~ '^[a-z0-9._-]+$'
    )
  );

alter table public.request_responses
  drop constraint if exists request_responses_responder_near_account_format;

alter table public.request_responses
  add constraint request_responses_responder_near_account_format check (
    responder_near_account_id is null
    or (
      char_length(trim(responder_near_account_id)) >= 2
      and char_length(trim(responder_near_account_id)) <= 64
      and responder_near_account_id ~ '^[a-z0-9._-]+$'
    )
  );

create index if not exists requests_requester_near_account_lower
  on public.requests (lower(trim(requester_near_account_id)))
  where requester_near_account_id is not null;

create index if not exists request_responses_responder_near_account_lower
  on public.request_responses (lower(trim(responder_near_account_id)))
  where responder_near_account_id is not null;

comment on column public.requests.requester_near_account_id is
  'Immutable snapshot of requester NEAR account at create time; null on pre-migration rows only.';

comment on column public.request_responses.responder_near_account_id is
  'Immutable snapshot of responder NEAR account at submit time; null on pre-migration rows only.';

-- Cutover: acceptance for new marketplace rows requires both snapshots.
do $$ begin
  perform 1;
end $$;

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------
create or replace function public.require_auth_linked_near_account()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_near text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  v_near := public.load_linked_near_account(v_uid);
  if v_near is null or char_length(trim(v_near)) = 0 then
    raise exception 'NEAR wallet required — sign in with your wallet first'
      using errcode = '22023';
  end if;
  return lower(trim(v_near));
end;
$$;

revoke all on function public.require_auth_linked_near_account() from public;
revoke all on function public.require_auth_linked_near_account() from anon;

create or replace function public.resolve_participant_near_accounts(
  p_request public.requests,
  p_response public.request_responses,
  p_provider_user_id uuid
)
returns table (
  requester_near text,
  provider_near text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_req_snap text;
  v_res_snap text;
  v_cutover constant timestamptz := '2026-11-08 00:00:00+00';
begin
  v_req_snap := case
    when p_request.requester_near_account_id is null then null
    else lower(trim(p_request.requester_near_account_id))
  end;
  v_res_snap := case
    when p_response.responder_near_account_id is null then null
    else lower(trim(p_response.responder_near_account_id))
  end;

  if v_req_snap is not null and v_res_snap is not null then
    return query select v_req_snap, v_res_snap;
    return;
  end if;

  if p_request.created_at >= v_cutover or p_response.created_at >= v_cutover then
    raise exception 'missing wallet snapshots on request or response';
  end if;

  return query
  select
    lower(trim(public.load_linked_near_account(p_request.requester_id))),
    lower(trim(public.load_linked_near_account(p_provider_user_id)));
end;
$$;

revoke all on function public.resolve_participant_near_accounts(public.requests, public.request_responses, uuid) from public;
revoke all on function public.resolve_participant_near_accounts(public.requests, public.request_responses, uuid) from anon;
revoke all on function public.resolve_participant_near_accounts(public.requests, public.request_responses, uuid) from authenticated;

-- ---------------------------------------------------------------------------
-- Immutability
-- ---------------------------------------------------------------------------
create or replace function public.prevent_request_wallet_snapshot_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if old.requester_near_account_id is not null
      and new.requester_near_account_id is distinct from old.requester_near_account_id then
      raise exception 'requester wallet snapshot is immutable';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists requests_wallet_snapshot_immutable on public.requests;
create trigger requests_wallet_snapshot_immutable
  before update on public.requests
  for each row execute function public.prevent_request_wallet_snapshot_mutation();

create or replace function public.prevent_response_wallet_snapshot_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if old.responder_near_account_id is not null
      and new.responder_near_account_id is distinct from old.responder_near_account_id then
      raise exception 'responder wallet snapshot is immutable';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists request_responses_wallet_snapshot_immutable on public.request_responses;
create trigger request_responses_wallet_snapshot_immutable
  before update on public.request_responses
  for each row execute function public.prevent_response_wallet_snapshot_mutation();

-- ---------------------------------------------------------------------------
-- create_request — snapshot from auth-linked wallet (not client input)
-- ---------------------------------------------------------------------------
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
  v_decimals smallint;
  v_factor numeric;
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

  select a.decimals into v_decimals from public.assets a where a.id = p_budget_asset_id;
  if v_decimals is null then
    raise exception 'Invalid asset';
  end if;

  v_factor := 10 ^ v_decimals::int;
  if p_budget_amount % v_factor <> 0 then
    raise exception 'Budget precision must match the selected asset smallest units';
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

-- ---------------------------------------------------------------------------
-- submit_request_response — responder snapshot from session
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

-- ---------------------------------------------------------------------------
-- accept_response_with_ids — copy snapshots onto assignment
-- ---------------------------------------------------------------------------
create or replace function public.accept_response_with_ids(
  p_request_id uuid,
  p_response_id uuid,
  p_assignment_id uuid,
  p_engagement_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.requests%rowtype;
  v_rr public.request_responses%rowtype;
  v_provider_uid uuid;
  v_pp_rec public.provider_profiles%rowtype;
  v_scheduled_day date;
  v_promote_count int;
  v_rej_ids uuid[];
  v_requester_near text;
  v_provider_near text;
begin
  select * into v_req from public.requests where id = p_request_id for update;
  if not found then
    raise exception 'Request not found';
  end if;

  if v_req.status = 'assigned' then
    if exists (
      select 1 from public.assignments a
      where a.request_id = p_request_id
        and a.accepted_response_id = p_response_id
    ) then
      return;
    end if;
    raise exception 'Request already assigned';
  end if;

  if v_req.status <> 'open' then
    raise exception 'Request is not open for acceptance';
  end if;

  select * into v_rr
  from public.request_responses rr
  where rr.id = p_response_id
  for update;
  if not found or v_rr.request_id is distinct from p_request_id then
    raise exception 'Response not found';
  end if;
  if v_rr.status is distinct from 'pending' then
    raise exception 'Response is not pending';
  end if;

  select * into v_pp_rec from public.provider_profiles pp where pp.id = v_rr.provider_profile_id;
  if not found then
    raise exception 'Provider profile not found';
  end if;
  v_provider_uid := v_pp_rec.user_id;

  select r.requester_near, r.provider_near
  into v_requester_near, v_provider_near
  from public.resolve_participant_near_accounts(v_req, v_rr, v_provider_uid) r;

  if v_requester_near is null or v_provider_near is null then
    raise exception 'missing participant wallet snapshots';
  end if;

  if v_req.timing_type = 'scheduled' and v_req.scheduled_at is not null then
    v_scheduled_day := (v_req.scheduled_at at time zone 'UTC')::date;
  else
    v_scheduled_day := (timezone('UTC', now()))::date;
  end if;

  if exists (
    select 1 from public.engagements e
    where e.provider_user_id = v_provider_uid
      and e.status = 'active'::public.engagement_status
      and e.scheduled_for_day = v_scheduled_day
  ) then
    raise exception 'Provider already has an active engagement on this date';
  end if;

  select array_agg(rr.id) into v_rej_ids
  from public.request_responses rr
  where rr.request_id = p_request_id
    and rr.status = 'pending'
    and rr.id <> p_response_id;

  update public.request_responses
  set status = 'rejected', updated_at = now()
  where request_id = p_request_id
    and status = 'pending'
    and id <> p_response_id;

  update public.request_responses
  set status = 'accepted', updated_at = now()
  where id = p_response_id;

  insert into public.assignments (
    id,
    request_id,
    accepted_response_id,
    requester_id,
    provider_user_id,
    requester_near_account_id,
    provider_near_account_id
  ) values (
    p_assignment_id,
    p_request_id,
    p_response_id,
    v_req.requester_id,
    v_provider_uid,
    v_requester_near,
    v_provider_near
  );

  insert into public.engagements (
    id, assignment_id, status, scheduled_for_day, provider_user_id
  ) values (
    p_engagement_id, p_assignment_id, 'active'::public.engagement_status,
    v_scheduled_day, v_provider_uid
  );

  update public.conversations c
  set kind = 'engagement'::public.conversation_kind,
      engagement_id = p_engagement_id,
      response_id = null,
      updated_at = now()
  where c.request_id = p_request_id
    and c.kind = 'pre_accept'
    and c.response_id = p_response_id;
  get diagnostics v_promote_count = row_count;

  if v_promote_count = 0 then
    insert into public.conversations (request_id, kind, engagement_id, response_id)
    values (p_request_id, 'engagement', p_engagement_id, null);
  end if;

  update public.requests
  set status = 'assigned', updated_at = now()
  where id = p_request_id;

  insert into public.notifications (user_id, kind, title, body, request_id, response_id, engagement_id)
  values
    (v_req.requester_id, 'engagement_created'::public.notification_kind,
     'Engagement started', 'You matched with a provider. Open the engagement to coordinate.',
     p_request_id, p_response_id, p_engagement_id),
    (v_provider_uid, 'response_accepted'::public.notification_kind,
     'Your offer was accepted', 'You have been assigned to a request.',
     p_request_id, p_response_id, p_engagement_id);

  if v_rej_ids is not null and array_length(v_rej_ids, 1) is not null then
    insert into public.notifications (user_id, kind, title, body, request_id, response_id)
    select pp.user_id, 'response_rejected'::public.notification_kind,
           'Another offer was accepted', 'Your pending offer was not selected for this request.',
           p_request_id, rid
    from unnest(v_rej_ids) as rid
    join public.request_responses rr on rr.id = rid
    join public.provider_profiles pp on pp.id = rr.provider_profile_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- prepare_acceptance_funding — use snapshots, not mutable profile wallet
-- ---------------------------------------------------------------------------
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
    chain_id, escrow_contract_id, asset_id, amount,
    requester_user_id, requester_near_account_id,
    provider_user_id, provider_near_account_id, status
  ) values (
    null, v_intent.id,
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

-- ---------------------------------------------------------------------------
-- prepare_engagement_funding — snapshots via assignment / request / response
-- ---------------------------------------------------------------------------
create or replace function public.prepare_engagement_funding(
  p_engagement_id uuid,
  p_escrow_contract_id text,
  p_chain_id text
)
returns public.engagement_escrow_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_eng public.engagements%rowtype;
  v_asn public.assignments%rowtype;
  v_req public.requests%rowtype;
  v_resp public.request_responses%rowtype;
  v_asset public.assets%rowtype;
  v_requester_near text;
  v_provider_near text;
  v_row public.engagement_escrow_payments%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if p_escrow_contract_id is null or length(trim(p_escrow_contract_id)) = 0 then
    raise exception 'escrow contract not configured';
  end if;

  select * into v_eng from public.engagements e where e.id = p_engagement_id;
  if not found or v_eng.status <> 'active'::public.engagement_status then
    raise exception 'engagement not found or not active';
  end if;

  select * into v_asn from public.assignments a where a.id = v_eng.assignment_id;
  if not found or v_asn.requester_id <> v_uid then
    raise exception 'only the requester may fund';
  end if;

  select * into v_resp from public.request_responses rr where rr.id = v_asn.accepted_response_id;
  if not found then
    raise exception 'accepted response not found';
  end if;

  select * into v_req from public.requests r where r.id = v_asn.request_id;
  if not found then
    raise exception 'request not found';
  end if;

  if v_asn.requester_near_account_id is not null
    and v_asn.provider_near_account_id is not null then
    v_requester_near := lower(trim(v_asn.requester_near_account_id));
    v_provider_near := lower(trim(v_asn.provider_near_account_id));
  else
    select r.requester_near, r.provider_near
    into v_requester_near, v_provider_near
    from public.resolve_participant_near_accounts(v_req, v_resp, v_asn.provider_user_id) r;
  end if;

  if v_requester_near is null or v_provider_near is null then
    raise exception 'both parties need linked NEAR wallets';
  end if;

  select * into v_asset from public.assets where id = v_resp.proposed_asset_id;
  if not found or v_asset.enabled is distinct from true or v_asset.chain_id <> p_chain_id then
    raise exception 'asset invalid for funding network';
  end if;

  select * into v_row
  from public.engagement_escrow_payments ep
  where ep.engagement_id = p_engagement_id
  for update;

  if found then
    if v_row.status = 'funded'::public.engagement_payment_status then
      raise exception 'engagement already funded';
    end if;
    if v_row.status in (
      'create_submitted'::public.engagement_payment_status,
      'deposit_submitted'::public.engagement_payment_status
    ) then
      raise exception 'funding already in progress';
    end if;

    update public.engagement_escrow_payments ep
    set
      status = 'prepared'::public.engagement_payment_status,
      chain_id = p_chain_id,
      escrow_contract_id = p_escrow_contract_id,
      asset_id = v_resp.proposed_asset_id,
      amount = v_resp.proposed_amount,
      requester_user_id = v_asn.requester_id,
      requester_near_account_id = v_requester_near,
      provider_user_id = v_asn.provider_user_id,
      provider_near_account_id = v_provider_near,
      on_chain_escrow_id = case
        when v_row.status = 'failed'::public.engagement_payment_status then null
        else ep.on_chain_escrow_id
      end,
      create_tx_hash = case
        when v_row.status = 'failed'::public.engagement_payment_status then null
        else ep.create_tx_hash
      end,
      fund_tx_hash = case
        when v_row.status = 'failed'::public.engagement_payment_status then null
        else ep.fund_tx_hash
      end,
      last_error = case
        when v_row.status = 'failed'::public.engagement_payment_status then null
        else ep.last_error
      end,
      funded_at = case
        when v_row.status = 'failed'::public.engagement_payment_status then null
        else ep.funded_at
      end
    where ep.id = v_row.id
    returning * into v_row;
  else
    insert into public.engagement_escrow_payments (
      engagement_id, chain_id, escrow_contract_id, asset_id, amount,
      requester_user_id, requester_near_account_id,
      provider_user_id, provider_near_account_id, status
    )
    values (
      p_engagement_id, p_chain_id, p_escrow_contract_id, v_resp.proposed_asset_id,
      v_resp.proposed_amount, v_asn.requester_id, v_requester_near,
      v_asn.provider_user_id, v_provider_near, 'prepared'
    )
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Funding prerequisites — prefer assignment snapshots
-- ---------------------------------------------------------------------------
drop function if exists public.get_engagement_funding_prerequisites(uuid);

create or replace function public.get_engagement_funding_prerequisites(
  p_engagement_id uuid
)
returns table (
  requester_wallet_linked boolean,
  provider_wallet_linked boolean,
  requester_display_name text,
  provider_display_name text,
  requester_near_account_id text,
  provider_near_account_id text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_asn public.assignments%rowtype;
  v_req_name text;
  v_prov_name text;
  v_req_near text;
  v_prov_near text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select a.* into v_asn
  from public.engagements e
  join public.assignments a on a.id = e.assignment_id
  where e.id = p_engagement_id;

  if not found then
    raise exception 'engagement not found';
  end if;

  if v_uid is distinct from v_asn.requester_id
    and v_uid is distinct from v_asn.provider_user_id then
    raise exception 'not a participant';
  end if;

  select display_name into v_req_name
  from public.profiles where id = v_asn.requester_id;

  select display_name into v_prov_name
  from public.profiles where id = v_asn.provider_user_id;

  v_req_near := coalesce(
    nullif(trim(v_asn.requester_near_account_id), ''),
    public.load_linked_near_account(v_asn.requester_id)
  );
  v_prov_near := coalesce(
    nullif(trim(v_asn.provider_near_account_id), ''),
    public.load_linked_near_account(v_asn.provider_user_id)
  );

  return query
  select
    v_req_near is not null,
    v_prov_near is not null,
    coalesce(v_req_name, 'Requester'),
    coalesce(v_prov_name, 'Provider'),
    v_req_near,
    v_prov_near;
end;
$$;

revoke all on function public.get_engagement_funding_prerequisites(uuid) from public;
grant execute on function public.get_engagement_funding_prerequisites(uuid) to authenticated;

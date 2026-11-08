-- Phase 4: shared escrow contract — payment row alignment (additive).
-- Deploy after all prior V2/V2.2 migrations. Safe on existing data (backfill only).
-- Rollback: drop new indexes/constraints/columns and restore prior RPC bodies from earlier migrations.

-- ---------------------------------------------------------------------------
-- Task / response linkage on payment rows (immutable after funding via trigger).
-- ---------------------------------------------------------------------------
alter table public.engagement_escrow_payments
  add column if not exists request_id uuid references public.requests (id) on delete restrict,
  add column if not exists response_id uuid references public.request_responses (id) on delete restrict;

create index if not exists engagement_escrow_payments_request_id_idx
  on public.engagement_escrow_payments (request_id)
  where request_id is not null;

comment on column public.engagement_escrow_payments.request_id is
  'Task (request) at funding time; backfilled from assignment or acceptance intent.';
comment on column public.engagement_escrow_payments.response_id is
  'Accepted response at funding time; frozen for reconciliation.';

-- One internal escrow record per shared contract (distinct from tx hash).
create unique index if not exists engagement_escrow_payments_chain_contract_on_chain_uniq
  on public.engagement_escrow_payments (chain_id, escrow_contract_id, on_chain_escrow_id)
  where on_chain_escrow_id is not null;

-- At most one funded payment per engagement.
create unique index if not exists engagement_escrow_payments_one_funded_per_engagement
  on public.engagement_escrow_payments (engagement_id)
  where engagement_id is not null
    and status = 'funded'::public.engagement_payment_status;

-- Backfill task linkage from assignment or acceptance intent (no invented values).
update public.engagement_escrow_payments ep
set
  request_id = a.request_id,
  response_id = coalesce(ep.response_id, a.accepted_response_id)
from public.engagements e
join public.assignments a on a.id = e.assignment_id
where ep.engagement_id = e.id
  and ep.request_id is null;

update public.engagement_escrow_payments ep
set
  request_id = i.request_id,
  response_id = i.response_id
from public.acceptance_funding_intents i
where ep.acceptance_intent_id = i.id
  and ep.request_id is null;

-- ---------------------------------------------------------------------------
-- Immutability after funded + on-chain id / tx hash stability
-- ---------------------------------------------------------------------------
create or replace function public.prevent_funded_payment_terms_mutation()
returns trigger
language plpgsql
as $$
begin
  if old.on_chain_escrow_id is not null
     and new.on_chain_escrow_id is distinct from old.on_chain_escrow_id then
    raise exception 'on_chain_escrow_id is immutable';
  end if;
  if old.fund_tx_hash is not null
     and new.fund_tx_hash is distinct from old.fund_tx_hash then
    raise exception 'fund tx hash is immutable';
  end if;
  if old.create_tx_hash is not null
     and new.create_tx_hash is distinct from old.create_tx_hash
     and old.fund_tx_hash is null then
    raise exception 'create tx hash is immutable';
  end if;
  if old.release_tx_hash is not null
     and new.release_tx_hash is distinct from old.release_tx_hash then
    raise exception 'release tx hash is immutable';
  end if;

  if old.status = 'funded'::public.engagement_payment_status then
    if new.amount is distinct from old.amount then
      raise exception 'funded amount is immutable';
    end if;
    if new.asset_id is distinct from old.asset_id then
      raise exception 'funded asset is immutable';
    end if;
    if new.chain_id is distinct from old.chain_id then
      raise exception 'funded chain is immutable';
    end if;
    if new.escrow_contract_id is distinct from old.escrow_contract_id then
      raise exception 'escrow contract is immutable after funding';
    end if;
    if lower(trim(new.requester_near_account_id))
       is distinct from lower(trim(old.requester_near_account_id)) then
      raise exception 'requester wallet snapshot is immutable after funding';
    end if;
    if lower(trim(new.provider_near_account_id))
       is distinct from lower(trim(old.provider_near_account_id)) then
      raise exception 'provider wallet snapshot is immutable after funding';
    end if;
    if new.requester_user_id is distinct from old.requester_user_id then
      raise exception 'requester user is immutable after funding';
    end if;
    if new.provider_user_id is distinct from old.provider_user_id then
      raise exception 'provider user is immutable after funding';
    end if;
    if new.request_id is not null
       and old.request_id is not null
       and new.request_id is distinct from old.request_id then
      raise exception 'request_id is immutable after funding';
    end if;
    if new.response_id is not null
       and old.response_id is not null
       and new.response_id is distinct from old.response_id then
      raise exception 'response_id is immutable after funding';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists engagement_escrow_payments_funded_terms_immutable
  on public.engagement_escrow_payments;
create trigger engagement_escrow_payments_funded_terms_immutable
  before update on public.engagement_escrow_payments
  for each row execute function public.prevent_funded_payment_terms_mutation();

-- ---------------------------------------------------------------------------
-- prepare_acceptance_funding — persist request_id on payment row
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

-- ---------------------------------------------------------------------------
-- record_acceptance_funding_progress — guarded transitions (service role only)
-- ---------------------------------------------------------------------------
create or replace function public.record_acceptance_funding_progress(
  p_intent_id uuid,
  p_intent_status public.acceptance_funding_intent_status,
  p_payment_status public.engagement_payment_status,
  p_on_chain_escrow_id bigint default null,
  p_create_tx_hash text default null,
  p_fund_tx_hash text default null,
  p_last_error text default null
)
returns public.acceptance_funding_intents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intent public.acceptance_funding_intents%rowtype;
  v_pay public.engagement_escrow_payments%rowtype;
  v_next_on_chain bigint;
  v_next_fund_hash text;
begin
  select * into v_intent from public.acceptance_funding_intents where id = p_intent_id for update;
  if not found then
    raise exception 'intent not found';
  end if;

  if v_intent.status = 'finalized' and p_intent_status is distinct from 'finalized' then
    return v_intent;
  end if;

  if v_intent.status in ('failed', 'expired')
     and p_intent_status not in ('failed', 'expired', 'finalized') then
    raise exception 'cannot progress terminal intent';
  end if;

  if p_create_tx_hash is not null and v_intent.create_tx_hash is not null
     and v_intent.create_tx_hash <> p_create_tx_hash then
    raise exception 'create tx hash already set';
  end if;
  if p_fund_tx_hash is not null and v_intent.fund_tx_hash is not null
     and v_intent.fund_tx_hash <> p_fund_tx_hash then
    raise exception 'fund tx hash already set';
  end if;
  if p_on_chain_escrow_id is not null and v_intent.on_chain_escrow_id is not null
     and v_intent.on_chain_escrow_id <> p_on_chain_escrow_id then
    raise exception 'on_chain_escrow_id already set';
  end if;

  if v_intent.payment_id is not null then
    select * into v_pay from public.engagement_escrow_payments where id = v_intent.payment_id for update;

    if v_pay.status = 'funded'::public.engagement_payment_status
       and p_payment_status is distinct from 'funded'::public.engagement_payment_status then
      raise exception 'cannot regress funded payment';
    end if;

    if p_payment_status = 'funded'::public.engagement_payment_status then
      v_next_on_chain := coalesce(p_on_chain_escrow_id, v_pay.on_chain_escrow_id);
      v_next_fund_hash := coalesce(p_fund_tx_hash, v_pay.fund_tx_hash, p_create_tx_hash, v_pay.create_tx_hash);
      if v_next_on_chain is null then
        raise exception 'on_chain_escrow_id required before marking funded';
      end if;
      if v_next_fund_hash is null or length(trim(v_next_fund_hash)) = 0 then
        raise exception 'fund tx hash required before marking funded';
      end if;
    end if;

    if p_on_chain_escrow_id is not null and v_pay.on_chain_escrow_id is not null
       and p_on_chain_escrow_id <> v_pay.on_chain_escrow_id then
      raise exception 'on_chain_escrow_id already set on payment';
    end if;
    if p_fund_tx_hash is not null and v_pay.fund_tx_hash is not null
       and p_fund_tx_hash <> v_pay.fund_tx_hash then
      raise exception 'fund tx hash already set on payment';
    end if;

    case v_pay.status
      when 'prepared'::public.engagement_payment_status then
        if p_payment_status not in (
          'prepared', 'create_submitted', 'deposit_submitted', 'funded', 'failed'
        ) then
          raise exception 'invalid payment transition from prepared';
        end if;
      when 'create_submitted'::public.engagement_payment_status then
        if p_payment_status not in (
          'create_submitted', 'deposit_submitted', 'funded', 'failed'
        ) then
          raise exception 'invalid payment transition from create_submitted';
        end if;
      when 'deposit_submitted'::public.engagement_payment_status then
        if p_payment_status not in ('deposit_submitted', 'funded', 'failed') then
          raise exception 'invalid payment transition from deposit_submitted';
        end if;
      when 'funded'::public.engagement_payment_status then
        if p_payment_status <> 'funded'::public.engagement_payment_status then
          raise exception 'invalid payment transition from funded';
        end if;
      when 'failed'::public.engagement_payment_status then
        if p_payment_status not in ('failed', 'prepared', 'create_submitted') then
          raise exception 'invalid payment transition from failed';
        end if;
      else
        null;
    end case;
  end if;

  update public.acceptance_funding_intents
  set
    status = p_intent_status,
    on_chain_escrow_id = coalesce(p_on_chain_escrow_id, on_chain_escrow_id),
    create_tx_hash = coalesce(p_create_tx_hash, create_tx_hash),
    fund_tx_hash = coalesce(p_fund_tx_hash, fund_tx_hash),
    last_error = p_last_error,
    updated_at = now()
  where id = p_intent_id
  returning * into v_intent;

  if v_intent.payment_id is not null then
    update public.engagement_escrow_payments ep
    set
      status = p_payment_status,
      on_chain_escrow_id = coalesce(p_on_chain_escrow_id, ep.on_chain_escrow_id),
      create_tx_hash = coalesce(p_create_tx_hash, ep.create_tx_hash),
      fund_tx_hash = coalesce(p_fund_tx_hash, ep.fund_tx_hash),
      last_error = p_last_error,
      funded_at = case when p_payment_status = 'funded'::public.engagement_payment_status
        then coalesce(ep.funded_at, now()) else ep.funded_at end,
      updated_at = now()
    where ep.id = v_intent.payment_id;
  end if;

  return v_intent;
end;
$$;

-- ---------------------------------------------------------------------------
-- record_engagement_payment_progress — atomic fund_escrow path (prepared → funded)
-- ---------------------------------------------------------------------------
create or replace function public.record_engagement_payment_progress(
  p_engagement_id uuid,
  p_status public.engagement_payment_status,
  p_on_chain_escrow_id bigint default null,
  p_create_tx_hash text default null,
  p_fund_tx_hash text default null,
  p_last_error text default null
)
returns public.engagement_escrow_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.engagement_escrow_payments%rowtype;
  v_next_on_chain bigint;
  v_next_fund_hash text;
begin
  select * into v_row
  from public.engagement_escrow_payments ep
  where ep.engagement_id = p_engagement_id
  for update;

  if not found then
    raise exception 'payment row not found';
  end if;

  if v_row.status = 'funded'::public.engagement_payment_status
     and p_status is distinct from 'funded'::public.engagement_payment_status then
    raise exception 'cannot regress funded payment';
  end if;

  if v_row.status = 'funded'::public.engagement_payment_status
     and p_status = 'funded'::public.engagement_payment_status then
    return v_row;
  end if;

  if p_create_tx_hash is not null
     and v_row.create_tx_hash is not null
     and v_row.create_tx_hash <> p_create_tx_hash then
    raise exception 'create tx hash already set';
  end if;

  if p_fund_tx_hash is not null
     and v_row.fund_tx_hash is not null
     and v_row.fund_tx_hash <> p_fund_tx_hash then
    raise exception 'fund tx hash already set';
  end if;

  if p_on_chain_escrow_id is not null
     and v_row.on_chain_escrow_id is not null
     and v_row.on_chain_escrow_id <> p_on_chain_escrow_id then
    raise exception 'on_chain_escrow_id already set';
  end if;

  if p_status = 'funded'::public.engagement_payment_status then
    v_next_on_chain := coalesce(p_on_chain_escrow_id, v_row.on_chain_escrow_id);
    v_next_fund_hash := coalesce(p_fund_tx_hash, v_row.fund_tx_hash, p_create_tx_hash, v_row.create_tx_hash);
    if v_next_on_chain is null then
      raise exception 'on_chain_escrow_id required before marking funded';
    end if;
    if v_next_fund_hash is null or length(trim(v_next_fund_hash)) = 0 then
      raise exception 'fund tx hash required before marking funded';
    end if;
  end if;

  case v_row.status
    when 'prepared'::public.engagement_payment_status then
      if p_status not in (
        'prepared', 'create_submitted', 'deposit_submitted', 'funded', 'failed'
      ) then
        raise exception 'invalid payment transition from prepared';
      end if;
    when 'create_submitted'::public.engagement_payment_status then
      if p_status not in (
        'create_submitted', 'deposit_submitted', 'funded', 'failed'
      ) then
        raise exception 'invalid payment transition from create_submitted';
      end if;
    when 'deposit_submitted'::public.engagement_payment_status then
      if p_status not in ('deposit_submitted', 'funded', 'failed') then
        raise exception 'invalid payment transition from deposit_submitted';
      end if;
    when 'failed'::public.engagement_payment_status then
      if p_status not in ('failed', 'prepared', 'create_submitted') then
        raise exception 'invalid payment transition from failed';
      end if;
    when 'funded'::public.engagement_payment_status then
      if p_status <> 'funded'::public.engagement_payment_status then
        raise exception 'invalid payment transition from funded';
      end if;
    else
      null;
  end case;

  update public.engagement_escrow_payments ep
  set
    status = p_status,
    on_chain_escrow_id = coalesce(p_on_chain_escrow_id, ep.on_chain_escrow_id),
    create_tx_hash = coalesce(p_create_tx_hash, ep.create_tx_hash),
    fund_tx_hash = coalesce(p_fund_tx_hash, ep.fund_tx_hash),
    last_error = p_last_error,
    funded_at = case when p_status = 'funded'::public.engagement_payment_status
      then coalesce(ep.funded_at, now()) else ep.funded_at end
  where ep.id = v_row.id
  returning * into v_row;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- finalize_acceptance_after_funding — bind engagement + task on payment row
-- ---------------------------------------------------------------------------
create or replace function public.finalize_acceptance_after_funding(p_intent_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intent public.acceptance_funding_intents%rowtype;
  v_pay public.engagement_escrow_payments%rowtype;
begin
  select * into v_intent from public.acceptance_funding_intents where id = p_intent_id for update;
  if not found then
    raise exception 'intent not found';
  end if;

  if v_intent.status = 'finalized' then
    return v_intent.planned_engagement_id;
  end if;

  if v_intent.status is distinct from 'funding_verified'::public.acceptance_funding_intent_status then
    raise exception 'funding not verified';
  end if;

  if v_intent.payment_id is null then
    raise exception 'payment missing';
  end if;

  select * into v_pay from public.engagement_escrow_payments where id = v_intent.payment_id for update;
  if v_pay.status is distinct from 'funded'::public.engagement_payment_status then
    raise exception 'payment not funded';
  end if;

  if v_pay.on_chain_escrow_id is null then
    raise exception 'payment missing on_chain_escrow_id';
  end if;

  if v_pay.fund_tx_hash is null and v_pay.create_tx_hash is null then
    raise exception 'payment missing funding transaction hash';
  end if;

  perform public.accept_response_with_ids(
    v_intent.request_id,
    v_intent.response_id,
    v_intent.planned_assignment_id,
    v_intent.planned_engagement_id
  );

  update public.engagement_escrow_payments
  set
    engagement_id = v_intent.planned_engagement_id,
    request_id = coalesce(request_id, v_intent.request_id),
    response_id = coalesce(response_id, v_intent.response_id),
    updated_at = now()
  where id = v_intent.payment_id;

  update public.acceptance_funding_intents
  set status = 'finalized',
      finalized_at = now(),
      updated_at = now()
  where id = p_intent_id;

  perform public.sync_engagement_payment_events(v_intent.payment_id);

  return v_intent.planned_engagement_id;
end;
$$;

-- prepare_engagement_funding — store request_id on new rows
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
      request_id = coalesce(ep.request_id, v_asn.request_id),
      response_id = coalesce(ep.response_id, v_asn.accepted_response_id),
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
      engagement_id, request_id, response_id,
      chain_id, escrow_contract_id, asset_id, amount,
      requester_user_id, requester_near_account_id,
      provider_user_id, provider_near_account_id, status
    )
    values (
      p_engagement_id, v_asn.request_id, v_asn.accepted_response_id,
      p_chain_id, p_escrow_contract_id, v_resp.proposed_asset_id,
      v_resp.proposed_amount, v_asn.requester_id, v_requester_near,
      v_asn.provider_user_id, v_provider_near, 'prepared'
    )
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

-- V2.1 security hardening (release-readiness remediation).

-- C2: linked NEAR lookup is internal-only (definer RPCs), not PostgREST-callable.
create or replace function public.load_linked_near_account(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select w.near_account_id
  from public.linked_near_wallets w
  where w.user_id = p_user_id
    and w.unlinked_at is null
  limit 1;
$$;

revoke all on function public.load_linked_near_account(uuid) from public;
revoke all on function public.load_linked_near_account(uuid) from authenticated;
revoke all on function public.load_linked_near_account(uuid) from anon;

-- M1: helper RPCs — only self probes via authenticated callers.
create or replace function public.is_engagement_participant(
  p_engagement_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and p_user_id is distinct from auth.uid() then
    return false;
  end if;

  return exists (
    select 1
    from public.engagements e
    join public.assignments a on a.id = e.assignment_id
    where e.id = p_engagement_id
      and (a.requester_id = p_user_id or a.provider_user_id = p_user_id)
  );
end;
$$;

create or replace function public.is_provider_profile_owner(
  p_provider_profile_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and p_user_id is distinct from auth.uid() then
    return false;
  end if;

  return exists (
    select 1
    from public.provider_profiles pp
    where pp.id = p_provider_profile_id
      and pp.user_id = p_user_id
  );
end;
$$;

create or replace function public.user_has_offer_on_request(
  p_request_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and p_user_id is distinct from auth.uid() then
    return false;
  end if;

  return exists (
    select 1
    from public.request_responses rr
    join public.provider_profiles pp on pp.id = rr.provider_profile_id
    where rr.request_id = p_request_id
      and pp.user_id = p_user_id
      and rr.status is distinct from 'withdrawn'::public.response_status
  );
end;
$$;

-- M2: challenges only via create_near_wallet_link_challenge.
drop policy if exists wallet_link_challenges_insert_own on public.wallet_link_challenges;

-- H3: wallet-link message binds PaidAid user + network (must match TS verifier).
drop function if exists public.create_near_wallet_link_challenge(text);

create or replace function public.create_near_wallet_link_challenge(
  p_near_account_id text,
  p_network_id text default 'localnet'
)
returns table (
  challenge_id uuid,
  message text,
  nonce_hex text,
  recipient text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_nonce bytea;
  v_id uuid;
  v_expires timestamptz := now() + interval '5 minutes';
  v_recipient text := 'paidaid';
  v_account text := lower(trim(p_near_account_id));
  v_network text := lower(trim(coalesce(p_network_id, 'localnet')));
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if v_account is null or v_account = '' or v_account !~ '^[a-z0-9._-]+$' then
    raise exception 'invalid near account id' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.linked_near_wallets w
    where w.user_id = v_user_id and w.unlinked_at is null
  ) then
    raise exception 'wallet already linked' using errcode = '23505';
  end if;
  if exists (
    select 1 from public.linked_near_wallets w
    where lower(trim(w.near_account_id)) = v_account and w.unlinked_at is null
  ) then
    raise exception 'near account already linked' using errcode = '23505';
  end if;

  v_nonce := extensions.gen_random_bytes(32);
  insert into public.wallet_link_challenges (user_id, near_account_id, nonce, expires_at)
  values (v_user_id, v_account, v_nonce, v_expires)
  returning id into v_id;

  return query
  select
    v_id,
    format(
      'Link NEAR account %s to PaidAid user %s. Challenge %s. Network %s. Recipient %s.',
      v_account,
      v_user_id,
      v_id,
      v_network,
      v_recipient
    ),
    encode(v_nonce, 'hex'),
    v_recipient,
    v_expires;
end;
$$;

-- H2: prepare_engagement_funding — lock row; never reset in-flight funding.
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

  select * into v_asset from public.assets where id = v_resp.proposed_asset_id;
  if not found or v_asset.enabled is distinct from true or v_asset.chain_id <> p_chain_id then
    raise exception 'asset invalid for funding network';
  end if;

  v_requester_near := public.load_linked_near_account(v_asn.requester_id);
  v_provider_near := public.load_linked_near_account(v_asn.provider_user_id);
  if v_requester_near is null or v_provider_near is null then
    raise exception 'both parties need linked NEAR wallets';
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

-- M4: guarded payment progress transitions.
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

  case v_row.status
    when 'prepared'::public.engagement_payment_status then
      if p_status not in (
        'prepared'::public.engagement_payment_status,
        'create_submitted'::public.engagement_payment_status,
        'failed'::public.engagement_payment_status
      ) then
        raise exception 'invalid payment transition from prepared';
      end if;
    when 'create_submitted'::public.engagement_payment_status then
      if p_status not in (
        'create_submitted'::public.engagement_payment_status,
        'deposit_submitted'::public.engagement_payment_status,
        'funded'::public.engagement_payment_status,
        'failed'::public.engagement_payment_status
      ) then
        raise exception 'invalid payment transition from create_submitted';
      end if;
    when 'deposit_submitted'::public.engagement_payment_status then
      if p_status not in (
        'deposit_submitted'::public.engagement_payment_status,
        'funded'::public.engagement_payment_status,
        'failed'::public.engagement_payment_status
      ) then
        raise exception 'invalid payment transition from deposit_submitted';
      end if;
    when 'failed'::public.engagement_payment_status then
      if p_status not in (
        'failed'::public.engagement_payment_status,
        'prepared'::public.engagement_payment_status,
        'create_submitted'::public.engagement_payment_status
      ) then
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
    funded_at = case when p_status = 'funded'::public.engagement_payment_status then coalesce(ep.funded_at, now()) else ep.funded_at end
  where ep.id = v_row.id
  returning * into v_row;

  return v_row;
end;
$$;

-- M4: guarded settlement progress transitions.
create or replace function public.record_engagement_settlement_progress(
  p_engagement_id uuid,
  p_status public.engagement_settlement_status,
  p_release_tx_hash text default null,
  p_last_error text default null
)
returns public.engagement_escrow_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.engagement_escrow_payments%rowtype;
begin
  select * into v_row
  from public.engagement_escrow_payments ep
  where ep.engagement_id = p_engagement_id
  for update;

  if not found then
    raise exception 'payment row not found';
  end if;

  if v_row.settlement_status = 'released'::public.engagement_settlement_status
     and p_status is distinct from 'released'::public.engagement_settlement_status then
    raise exception 'cannot regress released settlement';
  end if;

  if v_row.settlement_status = 'released'::public.engagement_settlement_status
     and p_status = 'released'::public.engagement_settlement_status then
    return v_row;
  end if;

  if p_release_tx_hash is not null
     and v_row.release_tx_hash is not null
     and v_row.release_tx_hash <> p_release_tx_hash then
    raise exception 'release tx hash already set';
  end if;

  if v_row.settlement_status = 'not_eligible'::public.engagement_settlement_status
     and p_status not in (
       'not_eligible'::public.engagement_settlement_status,
       'eligible'::public.engagement_settlement_status
     ) then
    raise exception 'invalid settlement transition from not_eligible';
  end if;

  update public.engagement_escrow_payments ep
  set
    settlement_status = p_status,
    release_tx_hash = coalesce(p_release_tx_hash, ep.release_tx_hash),
    settlement_last_error = p_last_error,
    released_at = case
      when p_status = 'released'::public.engagement_settlement_status then coalesce(ep.released_at, now())
      else ep.released_at
    end
  where ep.id = v_row.id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.create_near_wallet_link_challenge(text, text) from public;
grant execute on function public.create_near_wallet_link_challenge(text, text) to authenticated;

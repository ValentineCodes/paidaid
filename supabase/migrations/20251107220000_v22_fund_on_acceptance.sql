-- V2.2 fund-on-acceptance: intents + finalize after verified on-chain funding.

do $$ begin
  create type public.acceptance_funding_intent_status as enum (
    'awaiting_wallet',
    'create_submitted',
    'fund_submitted',
    'funding_verified',
    'finalized',
    'failed',
    'expired'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.acceptance_funding_intents (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  response_id uuid not null references public.request_responses (id) on delete restrict,
  requester_user_id uuid not null references public.profiles (id) on delete cascade,
  planned_assignment_id uuid not null,
  planned_engagement_id uuid not null,
  status public.acceptance_funding_intent_status not null default 'awaiting_wallet',
  chain_id text not null,
  escrow_contract_id text not null,
  asset_id uuid not null references public.assets (id),
  amount numeric(78, 0) not null,
  requester_near_account_id text not null,
  provider_user_id uuid not null references public.profiles (id) on delete cascade,
  provider_near_account_id text not null,
  auth_nonce text not null,
  auth_expires_at timestamptz not null,
  payment_id uuid,
  create_tx_hash text,
  fund_tx_hash text,
  on_chain_escrow_id bigint,
  last_error text,
  finalized_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint acceptance_funding_intents_amount_positive check (amount > 0),
  constraint acceptance_funding_intents_nonce_len check (char_length(auth_nonce) >= 16 and char_length(auth_nonce) <= 64)
);

create unique index if not exists acceptance_funding_intents_one_active_per_request
  on public.acceptance_funding_intents (request_id)
  where status in (
    'awaiting_wallet'::public.acceptance_funding_intent_status,
    'create_submitted'::public.acceptance_funding_intent_status,
    'fund_submitted'::public.acceptance_funding_intent_status,
    'funding_verified'::public.acceptance_funding_intent_status
  );

create index if not exists acceptance_funding_intents_requester_idx
  on public.acceptance_funding_intents (requester_user_id, created_at desc);

create index if not exists acceptance_funding_intents_response_idx
  on public.acceptance_funding_intents (response_id);

alter table public.acceptance_funding_intents enable row level security;

drop policy if exists acceptance_funding_intents_select_requester
  on public.acceptance_funding_intents;
create policy acceptance_funding_intents_select_requester
  on public.acceptance_funding_intents for select
  to authenticated
  using (requester_user_id = auth.uid());

-- Payment rows may exist before engagement row (pre-finalize).
alter table public.engagement_escrow_payments
  alter column engagement_id drop not null;

alter table public.engagement_escrow_payments
  drop constraint if exists engagement_escrow_payments_one_per_engagement;

drop index if exists public.engagement_escrow_payments_one_per_engagement;

create unique index if not exists engagement_escrow_payments_one_per_engagement
  on public.engagement_escrow_payments (engagement_id)
  where engagement_id is not null;

alter table public.engagement_escrow_payments
  add column if not exists acceptance_intent_id uuid references public.acceptance_funding_intents (id) on delete set null;

create unique index if not exists engagement_escrow_payments_one_per_intent
  on public.engagement_escrow_payments (acceptance_intent_id)
  where acceptance_intent_id is not null;

alter table public.acceptance_funding_intents
  add constraint acceptance_funding_intents_payment_fk
  foreign key (payment_id) references public.engagement_escrow_payments (id) on delete set null;

-- Defer payment activity projection until engagement_id is set (post-finalize).
create or replace function public.trg_sync_engagement_payment_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.engagement_id is not null then
    perform public.sync_engagement_payment_events(new.id);
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Internal: marketplace accept with predetermined ids (used only after funding).
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
    id, request_id, accepted_response_id, requester_id, provider_user_id
  ) values (
    p_assignment_id, p_request_id, p_response_id, v_req.requester_id, v_provider_uid
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

revoke all on function public.accept_response_with_ids(uuid, uuid, uuid, uuid) from public;
revoke all on function public.accept_response_with_ids(uuid, uuid, uuid, uuid) from anon, authenticated;

-- Stage A
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

  v_requester_near := public.load_linked_near_account(v_req.requester_id);
  v_provider_near := public.load_linked_near_account(v_provider_uid);
  if v_requester_near is null or v_provider_near is null then
    raise exception 'both parties need linked NEAR wallets';
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

revoke all on function public.prepare_acceptance_funding(uuid, uuid, text, text, text, timestamptz) from public;
grant execute on function public.prepare_acceptance_funding(uuid, uuid, text, text, text, timestamptz) to authenticated;

-- Intent + payment progress (service role only).
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
    select * into v_pay from public.engagement_escrow_payments where id = v_intent.payment_id for update;
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

revoke all on function public.record_acceptance_funding_progress(
  uuid,
  public.acceptance_funding_intent_status,
  public.engagement_payment_status,
  bigint,
  text,
  text,
  text
) from public;
revoke all on function public.record_acceptance_funding_progress(
  uuid,
  public.acceptance_funding_intent_status,
  public.engagement_payment_status,
  bigint,
  text,
  text,
  text
) from anon, authenticated;
grant execute on function public.record_acceptance_funding_progress(
  uuid,
  public.acceptance_funding_intent_status,
  public.engagement_payment_status,
  bigint,
  text,
  text,
  text
) to service_role;

-- Stage B finalize (service role; caller must have verified on-chain funding).
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

  perform public.accept_response_with_ids(
    v_intent.request_id,
    v_intent.response_id,
    v_intent.planned_assignment_id,
    v_intent.planned_engagement_id
  );

  update public.engagement_escrow_payments
  set engagement_id = v_intent.planned_engagement_id, updated_at = now()
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

revoke all on function public.finalize_acceptance_after_funding(uuid) from public;
revoke all on function public.finalize_acceptance_after_funding(uuid) from anon, authenticated;
grant execute on function public.finalize_acceptance_after_funding(uuid) to service_role;

-- Direct accept bypass disabled for V2.2.
revoke all on function public.accept_response(uuid, uuid) from authenticated;

create or replace function public.get_acceptance_funding_intent(p_intent_id uuid)
returns public.acceptance_funding_intents
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.acceptance_funding_intents%rowtype;
begin
  select * into v_row from public.acceptance_funding_intents where id = p_intent_id;
  if not found then
    raise exception 'intent not found';
  end if;
  if v_uid is distinct from v_row.requester_user_id then
    raise exception 'forbidden';
  end if;
  return v_row;
end;
$$;

revoke all on function public.get_acceptance_funding_intent(uuid) from public;
grant execute on function public.get_acceptance_funding_intent(uuid) to authenticated;

-- Delivery requires funded escrow when a payment row exists.
create or replace function public.submit_delivery(
  p_engagement_id uuid,
  p_description text,
  p_post_to_chat boolean default false
)
returns table (delivery_id uuid, chat_message_id uuid)
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
  v_pay public.engagement_escrow_payments%rowtype;
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

  if exists (
    select 1 from public.engagement_escrow_payments ep
    where ep.engagement_id = p_engagement_id
  ) then
    select * into v_pay
    from public.engagement_escrow_payments ep
    where ep.engagement_id = p_engagement_id;
    if v_pay.status is distinct from 'funded'::public.engagement_payment_status then
      raise exception 'Escrow must be funded before delivery';
    end if;
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_uid
      and p.live_profile_photo_path is not null
      and p.live_profile_photo_captured_at is not null
  ) then
    raise exception 'Live profile photo required';
  end if;

  select * into v_dlv from public.deliveries where engagement_id = p_engagement_id;

  if not found then
    insert into public.deliveries (
      engagement_id, provider_user_id, status, description, submitted_at
    )
    values (
      p_engagement_id, v_uid, 'pending_review'::public.delivery_status,
      trim(p_description), now()
    )
    returning * into v_dlv;
  elsif v_dlv.status = 'revision_requested'::public.delivery_status then
    delete from public.delivery_attachments where delivery_id = v_dlv.id;
    update public.deliveries
    set description = trim(p_description),
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
    v_asn.requester_id, 'delivery_submitted'::public.notification_kind,
    'Delivery submitted', 'The provider submitted work for your review.',
    v_asn.request_id, p_engagement_id
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

-- V2 settlement: eligible → requester-signed release → engagement completed (P1c + P2a)

do $$ begin
  create type public.engagement_settlement_status as enum (
    'not_eligible',
    'eligible',
    'release_submitted',
    'released',
    'release_failed'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.engagement_settlement_trigger as enum (
    'manual_approve',
    'auto_complete'
  );
exception
  when duplicate_object then null;
end $$;

alter table public.engagement_escrow_payments
  add column if not exists settlement_status public.engagement_settlement_status
    not null default 'not_eligible',
  add column if not exists settlement_eligible_at timestamptz,
  add column if not exists settlement_trigger public.engagement_settlement_trigger,
  add column if not exists release_tx_hash text,
  add column if not exists released_at timestamptz,
  add column if not exists settlement_last_error text;

-- Refresh funding RPC return type after new payment columns (composite row type changed).
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
  update public.engagement_escrow_payments ep
  set
    status = p_status,
    on_chain_escrow_id = coalesce(p_on_chain_escrow_id, ep.on_chain_escrow_id),
    create_tx_hash = coalesce(p_create_tx_hash, ep.create_tx_hash),
    fund_tx_hash = coalesce(p_fund_tx_hash, ep.fund_tx_hash),
    last_error = p_last_error,
    funded_at = case when p_status = 'funded' then now() else ep.funded_at end
  where ep.engagement_id = p_engagement_id
  returning * into v_row;

  if not found then
    raise exception 'payment row not found';
  end if;

  return v_row;
end;
$$;

-- Mark delivery approved + settlement eligible (funded escrows only).
create or replace function public.mark_engagement_settlement_eligible(
  p_engagement_id uuid,
  p_trigger public.engagement_settlement_trigger
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eng public.engagements%rowtype;
  v_asn public.assignments%rowtype;
  v_dlv public.deliveries%rowtype;
  v_pay public.engagement_escrow_payments%rowtype;
begin
  select * into v_eng from public.engagements where id = p_engagement_id for update;
  if not found or v_eng.status <> 'active'::public.engagement_status then
    return false;
  end if;

  select * into v_dlv from public.deliveries where engagement_id = p_engagement_id for update;
  if not found or v_dlv.status <> 'pending_review'::public.delivery_status then
    return false;
  end if;

  if exists (
    select 1 from public.engagement_issues i
    where i.engagement_id = p_engagement_id and i.status = 'open'::public.issue_status
  ) then
    return false;
  end if;

  select * into v_pay
  from public.engagement_escrow_payments ep
  where ep.engagement_id = p_engagement_id
  for update;

  if not found or v_pay.status <> 'funded'::public.engagement_payment_status then
    return false;
  end if;

  if v_pay.settlement_status in (
    'eligible'::public.engagement_settlement_status,
    'release_submitted'::public.engagement_settlement_status,
    'released'::public.engagement_settlement_status
  ) then
    return true;
  end if;

  select * into v_asn from public.assignments where id = v_eng.assignment_id;

  update public.deliveries
  set
    status = 'approved'::public.delivery_status,
    approved_at = coalesce(approved_at, now())
  where id = v_dlv.id;

  update public.engagement_escrow_payments
  set
    settlement_status = 'eligible'::public.engagement_settlement_status,
    settlement_eligible_at = now(),
    settlement_trigger = p_trigger,
    settlement_last_error = null
  where id = v_pay.id;

  update public.engagements
  set auto_complete_deadline_at = null
  where id = p_engagement_id;

  if p_trigger = 'manual_approve'::public.engagement_settlement_trigger then
    insert into public.notifications (user_id, kind, title, body, request_id, engagement_id)
    values (
      v_asn.provider_user_id,
      'delivery_approved'::public.notification_kind,
      'Delivery approved',
      'The requester approved your delivery. Payment releases after on-chain settlement.',
      v_asn.request_id,
      p_engagement_id
    );
    insert into public.notifications (user_id, kind, title, body, request_id, engagement_id)
    values (
      v_asn.requester_id,
      'settlement_eligible'::public.notification_kind,
      'Release payment',
      'Approve complete — sign in NEAR to release escrow to your provider.',
      v_asn.request_id,
      p_engagement_id
    );
  else
    insert into public.notifications (user_id, kind, title, body, request_id, engagement_id)
    values (
      v_asn.requester_id,
      'settlement_auto_eligible'::public.notification_kind,
      'Release payment to finish',
      '72 hours passed — release escrow to complete this engagement.',
      v_asn.request_id,
      p_engagement_id
    );
    insert into public.notifications (user_id, kind, title, body, request_id, engagement_id)
    values (
      v_asn.provider_user_id,
      'settlement_auto_eligible'::public.notification_kind,
      'Awaiting payment release',
      'The requester must release escrow to complete the engagement.',
      v_asn.request_id,
      p_engagement_id
    );
  end if;

  return true;
end;
$$;

revoke all on function public.mark_engagement_settlement_eligible(uuid, public.engagement_settlement_trigger) from public;
grant execute on function public.mark_engagement_settlement_eligible(uuid, public.engagement_settlement_trigger) to service_role;

-- Complete engagement after on-chain release (service role only).
create or replace function public.complete_engagement_after_settlement(
  p_engagement_id uuid,
  p_auto boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eng public.engagements%rowtype;
  v_asn public.assignments%rowtype;
  v_dlv public.deliveries%rowtype;
  v_pay public.engagement_escrow_payments%rowtype;
begin
  select * into v_eng from public.engagements where id = p_engagement_id for update;
  if not found or v_eng.status <> 'active'::public.engagement_status then
    return false;
  end if;

  select * into v_dlv from public.deliveries where engagement_id = p_engagement_id;
  if not found or v_dlv.status <> 'approved'::public.delivery_status then
    return false;
  end if;

  if exists (
    select 1 from public.engagement_issues i
    where i.engagement_id = p_engagement_id and i.status = 'open'::public.issue_status
  ) then
    return false;
  end if;

  select * into v_pay
  from public.engagement_escrow_payments ep
  where ep.engagement_id = p_engagement_id;

  if found then
    if v_pay.settlement_status <> 'released'::public.engagement_settlement_status then
      return false;
    end if;
  end if;

  select * into v_asn from public.assignments where id = v_eng.assignment_id;

  if p_auto then
    update public.engagements
    set
      status = 'completed'::public.engagement_status,
      completed_at = now(),
      auto_completed_at = now(),
      auto_complete_deadline_at = null
    where id = p_engagement_id;
  else
    update public.engagements
    set
      status = 'completed'::public.engagement_status,
      completed_at = now(),
      auto_complete_deadline_at = null,
      auto_completed_at = null
    where id = p_engagement_id;
  end if;

  update public.requests
  set status = 'completed'::public.request_status
  where id = v_asn.request_id;

  if p_auto then
    insert into public.notifications (user_id, kind, title, body, request_id, engagement_id)
    values (
      v_asn.requester_id,
      'engagement_auto_completed'::public.notification_kind,
      'Engagement completed',
      'Payment released — engagement is complete.',
      v_asn.request_id,
      p_engagement_id
    );
    insert into public.notifications (user_id, kind, title, body, request_id, engagement_id)
    values (
      v_asn.provider_user_id,
      'engagement_auto_completed'::public.notification_kind,
      'Engagement completed',
      'Payment released — engagement is complete.',
      v_asn.request_id,
      p_engagement_id
    );
  else
    insert into public.notifications (user_id, kind, title, body, request_id, engagement_id)
    values (
      v_asn.provider_user_id,
      'settlement_released'::public.notification_kind,
      'Payment received',
      'Escrow was released to your linked NEAR wallet.',
      v_asn.request_id,
      p_engagement_id
    );
  end if;

  return true;
end;
$$;

revoke all on function public.complete_engagement_after_settlement(uuid, boolean) from public;
grant execute on function public.complete_engagement_after_settlement(uuid, boolean) to service_role;

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
  update public.engagement_escrow_payments ep
  set
    settlement_status = p_status,
    release_tx_hash = coalesce(p_release_tx_hash, ep.release_tx_hash),
    settlement_last_error = p_last_error,
    released_at = case
      when p_status = 'released'::public.engagement_settlement_status then now()
      else ep.released_at
    end
  where ep.engagement_id = p_engagement_id
  returning * into v_row;

  if not found then
    raise exception 'payment row not found';
  end if;

  return v_row;
end;
$$;

revoke all on function public.record_engagement_settlement_progress(
  uuid,
  public.engagement_settlement_status,
  text,
  text
) from public;
grant execute on function public.record_engagement_settlement_progress(
  uuid,
  public.engagement_settlement_status,
  text,
  text
) to service_role;

create or replace function public.get_engagement_settlement_status(p_engagement_id uuid)
returns table (
  settlement_status public.engagement_settlement_status,
  settlement_eligible_at timestamptz,
  settlement_trigger public.engagement_settlement_trigger,
  release_tx_hash text,
  released_at timestamptz,
  settlement_last_error text,
  payment_funded boolean,
  on_chain_escrow_id bigint,
  requester_near_account_id text,
  provider_near_account_id text,
  escrow_contract_id text,
  amount numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_engagement_participant(p_engagement_id, v_uid) then
    raise exception 'not a participant';
  end if;

  return query
  select
    ep.settlement_status,
    ep.settlement_eligible_at,
    ep.settlement_trigger,
    ep.release_tx_hash,
    ep.released_at,
    ep.settlement_last_error,
    (ep.status = 'funded'::public.engagement_payment_status) as payment_funded,
    ep.on_chain_escrow_id,
    ep.requester_near_account_id,
    ep.provider_near_account_id,
    ep.escrow_contract_id,
    ep.amount
  from public.engagement_escrow_payments ep
  where ep.engagement_id = p_engagement_id;
end;
$$;

revoke all on function public.get_engagement_settlement_status(uuid) from public;
grant execute on function public.get_engagement_settlement_status(uuid) to authenticated;

-- review_delivery: funded escrows → settlement eligible (P1c), else legacy complete
create or replace function public.review_delivery(
  p_engagement_id uuid,
  p_action text,
  p_revision_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_eng public.engagements%rowtype;
  v_asn public.assignments%rowtype;
  v_dlv public.deliveries%rowtype;
  v_ok boolean;
  v_has_payment boolean;
  v_pay public.engagement_escrow_payments%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_action not in ('approve', 'revision') then
    raise exception 'Invalid action';
  end if;

  select * into v_eng from public.engagements where id = p_engagement_id for update;
  if not found then
    raise exception 'Engagement not found';
  end if;
  select * into v_asn from public.assignments where id = v_eng.assignment_id;

  if v_asn.requester_id is distinct from v_uid then
    raise exception 'Only the requester can review delivery';
  end if;
  if v_eng.status <> 'active'::public.engagement_status then
    raise exception 'Engagement not active';
  end if;

  select * into v_dlv from public.deliveries where engagement_id = p_engagement_id;
  if not found or v_dlv.status <> 'pending_review'::public.delivery_status then
    raise exception 'No delivery pending review';
  end if;

  if p_action = 'approve' then
    select exists (
      select 1 from public.engagement_escrow_payments ep where ep.engagement_id = p_engagement_id
    ) into v_has_payment;

    if v_has_payment then
      select * into v_pay
      from public.engagement_escrow_payments ep
      where ep.engagement_id = p_engagement_id;

      if v_pay.status <> 'funded'::public.engagement_payment_status then
        raise exception 'Fund escrow before approving delivery';
      end if;

      select public.mark_engagement_settlement_eligible(
        p_engagement_id,
        'manual_approve'::public.engagement_settlement_trigger
      ) into v_ok;
      if not v_ok then
        raise exception 'Could not mark settlement eligible';
      end if;
    else
      select public.complete_engagement_after_delivery(p_engagement_id, false) into v_ok;
      if not v_ok then
        raise exception 'Could not complete engagement';
      end if;

      insert into public.notifications (user_id, kind, title, body, request_id, engagement_id)
      values (
        v_asn.provider_user_id,
        'delivery_approved'::public.notification_kind,
        'Delivery approved',
        'The requester approved your delivery.',
        v_asn.request_id,
        p_engagement_id
      );
    end if;
  else
    if p_revision_note is null or trim(p_revision_note) = '' then
      raise exception 'Revision note required';
    end if;
    if char_length(trim(p_revision_note)) > 2000 then
      raise exception 'Note too long';
    end if;

    update public.deliveries
    set
      status = 'revision_requested'::public.delivery_status,
      revision_requested_at = now()
    where id = v_dlv.id;

    update public.engagements
    set auto_complete_deadline_at = null
    where id = p_engagement_id;

    insert into public.notifications (user_id, kind, title, body, request_id, engagement_id)
    values (
      v_asn.provider_user_id,
      'delivery_revision_requested'::public.notification_kind,
      'Revision requested',
      left(trim(p_revision_note), 500),
      v_asn.request_id,
      p_engagement_id
    );
  end if;
end;
$$;

-- auto_complete: funded escrows → settlement eligible; unfunded → legacy complete
create or replace function public.auto_complete_engagements()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n int := 0;
  v_ok boolean;
  v_has_payment boolean;
  v_pay public.engagement_escrow_payments%rowtype;
begin
  for r in
    select e.id
    from public.engagements e
    where e.status = 'active'::public.engagement_status
      and e.auto_complete_deadline_at is not null
      and e.auto_complete_deadline_at <= now()
  loop
    select exists (
      select 1 from public.engagement_escrow_payments ep where ep.engagement_id = r.id
    ) into v_has_payment;

    if v_has_payment then
      select * into v_pay
      from public.engagement_escrow_payments ep
      where ep.engagement_id = r.id;

      if v_pay.status = 'funded'::public.engagement_payment_status then
        select public.mark_engagement_settlement_eligible(
          r.id,
          'auto_complete'::public.engagement_settlement_trigger
        ) into v_ok;
        if v_ok then
          n := n + 1;
        end if;
      end if;
    else
      select public.complete_engagement_after_delivery(r.id, true) into v_ok;
      if v_ok then
        n := n + 1;
      end if;
    end if;
  end loop;
  return n;
end;
$$;

grant execute on function public.review_delivery(uuid, text, text) to authenticated;
grant execute on function public.auto_complete_engagements() to service_role;

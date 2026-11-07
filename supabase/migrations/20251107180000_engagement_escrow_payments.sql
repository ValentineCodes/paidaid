-- V2 engagement escrow funding records (off-chain orchestration; on-chain state authoritative)

create type public.engagement_payment_status as enum (
  'prepared',
  'create_submitted',
  'deposit_submitted',
  'funded',
  'failed'
);

create table if not exists public.engagement_escrow_payments (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements (id) on delete cascade,
  status public.engagement_payment_status not null default 'prepared',
  chain_id text not null,
  escrow_contract_id text not null,
  asset_id uuid not null references public.assets (id),
  amount numeric(78, 0) not null,
  requester_user_id uuid not null references public.profiles (id),
  requester_near_account_id text not null,
  provider_user_id uuid not null references public.profiles (id),
  provider_near_account_id text not null,
  on_chain_escrow_id bigint,
  create_tx_hash text,
  fund_tx_hash text,
  last_error text,
  funded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint engagement_escrow_payments_one_per_engagement unique (engagement_id),
  constraint engagement_escrow_payments_amount_positive check (amount > 0)
);

create index if not exists engagement_escrow_payments_requester_idx
  on public.engagement_escrow_payments (requester_user_id);

create index if not exists engagement_escrow_payments_status_idx
  on public.engagement_escrow_payments (status);

alter table public.engagement_escrow_payments enable row level security;

drop policy if exists engagement_escrow_payments_select_participants
  on public.engagement_escrow_payments;
create policy engagement_escrow_payments_select_participants
  on public.engagement_escrow_payments for select
  to authenticated
  using (
    requester_user_id = auth.uid()
    or provider_user_id = auth.uid()
  );

-- Participants cannot insert/update; use RPC + service role apply.

create or replace function public.touch_engagement_payment_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists engagement_escrow_payments_updated_at
  on public.engagement_escrow_payments;
create trigger engagement_escrow_payments_updated_at
  before update on public.engagement_escrow_payments
  for each row execute function public.touch_engagement_payment_updated_at();

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
  if not found then
    raise exception 'engagement not found';
  end if;

  if v_eng.status <> 'active' then
    raise exception 'engagement is not active';
  end if;

  select * into v_asn from public.assignments a where a.id = v_eng.assignment_id;
  if not found then
    raise exception 'assignment not found';
  end if;

  if v_asn.requester_id <> v_uid then
    raise exception 'only the requester may fund';
  end if;

  select * into v_resp
  from public.request_responses rr
  where rr.id = v_asn.accepted_response_id;

  if not found then
    raise exception 'accepted response not found';
  end if;

  select * into v_asset from public.assets where id = v_resp.proposed_asset_id;
  if not found then
    raise exception 'asset not found';
  end if;

  if v_asset.enabled is distinct from true then
    raise exception 'asset is not enabled for payments';
  end if;

  if v_asset.chain_id <> p_chain_id then
    raise exception 'asset network mismatch';
  end if;

  v_requester_near := public.load_linked_near_account(v_asn.requester_id);
  if v_requester_near is null then
    raise exception 'requester has no linked NEAR wallet';
  end if;

  v_provider_near := public.load_linked_near_account(v_asn.provider_user_id);
  if v_provider_near is null then
    raise exception 'provider has no linked NEAR wallet';
  end if;

  select * into v_row
  from public.engagement_escrow_payments ep
  where ep.engagement_id = p_engagement_id;

  if found and v_row.status = 'funded' then
    raise exception 'engagement already funded';
  end if;

  if found then
    update public.engagement_escrow_payments ep
    set
      status = 'prepared',
      chain_id = p_chain_id,
      escrow_contract_id = p_escrow_contract_id,
      asset_id = v_resp.proposed_asset_id,
      amount = v_resp.proposed_amount,
      requester_user_id = v_asn.requester_id,
      requester_near_account_id = v_requester_near,
      provider_user_id = v_asn.provider_user_id,
      provider_near_account_id = v_provider_near,
      on_chain_escrow_id = null,
      create_tx_hash = null,
      fund_tx_hash = null,
      last_error = null,
      funded_at = null
    where ep.id = v_row.id
    returning * into v_row;
  else
    insert into public.engagement_escrow_payments (
      engagement_id,
      chain_id,
      escrow_contract_id,
      asset_id,
      amount,
      requester_user_id,
      requester_near_account_id,
      provider_user_id,
      provider_near_account_id,
      status
    )
    values (
      p_engagement_id,
      p_chain_id,
      p_escrow_contract_id,
      v_resp.proposed_asset_id,
      v_resp.proposed_amount,
      v_asn.requester_id,
      v_requester_near,
      v_asn.provider_user_id,
      v_provider_near,
      'prepared'
    )
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

revoke all on function public.prepare_engagement_funding(uuid, text, text) from public;
grant execute on function public.prepare_engagement_funding(uuid, text, text) to authenticated;

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

revoke all on function public.record_engagement_payment_progress(
  uuid,
  public.engagement_payment_status,
  bigint,
  text,
  text,
  text
) from public;
grant execute on function public.record_engagement_payment_progress(
  uuid,
  public.engagement_payment_status,
  bigint,
  text,
  text,
  text
) to service_role;

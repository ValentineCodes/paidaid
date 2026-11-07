-- V2 payment activity: append-only events, participant reads, summary + list RPCs.

do $$ begin
  create type public.engagement_payment_event_kind as enum (
    'funding',
    'payout',
    'refund'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.engagement_payment_event_status as enum (
    'pending',
    'success',
    'failed'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.engagement_payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.engagement_escrow_payments (id) on delete cascade,
  engagement_id uuid not null references public.engagements (id) on delete cascade,
  kind public.engagement_payment_event_kind not null,
  status public.engagement_payment_event_status not null default 'pending',
  amount numeric(78, 0) not null,
  asset_id uuid not null references public.assets (id),
  chain_id text not null,
  tx_hash text,
  tx_key text not null default '__none__',
  occurred_at timestamptz not null default now(),
  confirmed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint engagement_payment_events_amount_positive check (amount > 0)
);

create unique index if not exists engagement_payment_events_payment_kind_tx_uniq
  on public.engagement_payment_events (payment_id, kind, tx_key);

create index if not exists engagement_payment_events_engagement_idx
  on public.engagement_payment_events (engagement_id, occurred_at desc);

create index if not exists engagement_payment_events_payment_idx
  on public.engagement_payment_events (payment_id, occurred_at desc);

create index if not exists engagement_escrow_payments_provider_user_idx
  on public.engagement_escrow_payments (provider_user_id);

create index if not exists engagement_escrow_payments_updated_at_idx
  on public.engagement_escrow_payments (updated_at desc);

create or replace function public.touch_engagement_payment_event_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists engagement_payment_events_updated_at
  on public.engagement_payment_events;
create trigger engagement_payment_events_updated_at
  before update on public.engagement_payment_events
  for each row execute function public.touch_engagement_payment_event_updated_at();

alter table public.engagement_payment_events enable row level security;

drop policy if exists engagement_payment_events_select_participants
  on public.engagement_payment_events;
create policy engagement_payment_events_select_participants
  on public.engagement_payment_events for select
  to authenticated
  using (
    exists (
      select 1
      from public.engagement_escrow_payments ep
      where ep.id = engagement_payment_events.payment_id
        and (
          ep.requester_user_id = auth.uid()
          or ep.provider_user_id = auth.uid()
        )
    )
  );

-- Idempotent projection of payment row → activity events (service + triggers).
create or replace function public.sync_engagement_payment_events(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay public.engagement_escrow_payments%rowtype;
  v_fund_status public.engagement_payment_event_status;
  v_payout_status public.engagement_payment_event_status;
begin
  select * into v_pay
  from public.engagement_escrow_payments ep
  where ep.id = p_payment_id;

  if not found then
    return;
  end if;

  -- Funding event (fund tx preferred; otherwise create escrow tx).
  if v_pay.fund_tx_hash is not null
     or v_pay.status in (
       'create_submitted'::public.engagement_payment_status,
       'deposit_submitted'::public.engagement_payment_status,
       'funded'::public.engagement_payment_status,
       'failed'::public.engagement_payment_status
     )
  then
    if v_pay.status = 'funded'::public.engagement_payment_status then
      v_fund_status := 'success'::public.engagement_payment_event_status;
    elsif v_pay.status = 'failed'::public.engagement_payment_status then
      v_fund_status := 'failed'::public.engagement_payment_event_status;
    elsif v_pay.status in (
      'create_submitted'::public.engagement_payment_status,
      'deposit_submitted'::public.engagement_payment_status
    ) then
      v_fund_status := 'pending'::public.engagement_payment_event_status;
    else
      v_fund_status := 'pending'::public.engagement_payment_event_status;
    end if;

    insert into public.engagement_payment_events (
      payment_id,
      engagement_id,
      kind,
      status,
      amount,
      asset_id,
      chain_id,
      tx_hash,
      tx_key,
      occurred_at,
      confirmed_at,
      last_error
    )
    values (
      v_pay.id,
      v_pay.engagement_id,
      'funding'::public.engagement_payment_event_kind,
      v_fund_status,
      v_pay.amount,
      v_pay.asset_id,
      v_pay.chain_id,
      coalesce(v_pay.fund_tx_hash, v_pay.create_tx_hash),
      coalesce(v_pay.fund_tx_hash, v_pay.create_tx_hash, '__none__'),
      coalesce(v_pay.funded_at, v_pay.updated_at, now()),
      case
        when v_pay.status = 'funded'::public.engagement_payment_status then v_pay.funded_at
        else null
      end,
      case
        when v_pay.status = 'failed'::public.engagement_payment_status then v_pay.last_error
        else null
      end
    )
    on conflict (payment_id, kind, tx_key)
    do update set
      status = excluded.status,
      amount = excluded.amount,
      chain_id = excluded.chain_id,
      tx_hash = excluded.tx_hash,
      occurred_at = excluded.occurred_at,
      confirmed_at = excluded.confirmed_at,
      last_error = excluded.last_error,
      updated_at = now();
  end if;

  -- Payout (release) when funded flow progressed to settlement.
  if v_pay.status = 'funded'::public.engagement_payment_status
     or v_pay.release_tx_hash is not null
     or v_pay.settlement_status <> 'not_eligible'::public.engagement_settlement_status
  then
    if v_pay.settlement_status = 'released'::public.engagement_settlement_status then
      v_payout_status := 'success'::public.engagement_payment_event_status;
    elsif v_pay.settlement_status = 'release_failed'::public.engagement_settlement_status then
      v_payout_status := 'failed'::public.engagement_payment_event_status;
    elsif v_pay.settlement_status = 'release_submitted'::public.engagement_settlement_status then
      v_payout_status := 'pending'::public.engagement_payment_event_status;
    elsif v_pay.settlement_status in (
      'eligible'::public.engagement_settlement_status,
      'not_eligible'::public.engagement_settlement_status
    ) then
      v_payout_status := 'pending'::public.engagement_payment_event_status;
    else
      v_payout_status := 'pending'::public.engagement_payment_event_status;
    end if;

    insert into public.engagement_payment_events (
      payment_id,
      engagement_id,
      kind,
      status,
      amount,
      asset_id,
      chain_id,
      tx_hash,
      tx_key,
      occurred_at,
      confirmed_at,
      last_error
    )
    values (
      v_pay.id,
      v_pay.engagement_id,
      'payout'::public.engagement_payment_event_kind,
      v_payout_status,
      v_pay.amount,
      v_pay.asset_id,
      v_pay.chain_id,
      v_pay.release_tx_hash,
      coalesce(v_pay.release_tx_hash, '__none__'),
      coalesce(v_pay.released_at, v_pay.settlement_eligible_at, v_pay.funded_at, now()),
      case
        when v_pay.settlement_status = 'released'::public.engagement_settlement_status
        then v_pay.released_at
        else null
      end,
      case
        when v_pay.settlement_status = 'release_failed'::public.engagement_settlement_status
        then v_pay.settlement_last_error
        else null
      end
    )
    on conflict (payment_id, kind, tx_key)
    do update set
      status = excluded.status,
      amount = excluded.amount,
      chain_id = excluded.chain_id,
      tx_hash = excluded.tx_hash,
      occurred_at = excluded.occurred_at,
      confirmed_at = excluded.confirmed_at,
      last_error = excluded.last_error,
      updated_at = now();
  end if;
end;
$$;

revoke all on function public.sync_engagement_payment_events(uuid) from public;
grant execute on function public.sync_engagement_payment_events(uuid) to service_role;
-- Optional manual resync after reconciliation (idempotent projection).

create or replace function public.trg_sync_engagement_payment_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_engagement_payment_events(new.id);
  return new;
end;
$$;

drop trigger if exists engagement_escrow_payments_sync_events_trg
  on public.engagement_escrow_payments;
create trigger engagement_escrow_payments_sync_events_trg
  after insert or update on public.engagement_escrow_payments
  for each row execute function public.trg_sync_engagement_payment_events();

-- Backfill existing payment rows.
do $$
declare
  r record;
begin
  for r in select id from public.engagement_escrow_payments loop
    perform public.sync_engagement_payment_events(r.id);
  end loop;
end $$;

create or replace function public.get_my_payment_summary()
returns table (
  total_funded_amount text,
  locked_in_escrow_amount text,
  total_received_amount text,
  total_refunded_amount text,
  funded_count bigint,
  locked_count bigint,
  received_count bigint,
  refund_count bigint
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

  return query
  with mine as (
    select ep.*
    from public.engagement_escrow_payments ep
    where ep.requester_user_id = v_uid
       or ep.provider_user_id = v_uid
  ),
  funded_req as (
    select coalesce(sum(m.amount), 0) as amt, count(*)::bigint as cnt
    from mine m
    where m.requester_user_id = v_uid
      and m.status = 'funded'::public.engagement_payment_status
  ),
  locked_req as (
    select coalesce(sum(m.amount), 0) as amt, count(*)::bigint as cnt
    from mine m
    where m.requester_user_id = v_uid
      and m.status = 'funded'::public.engagement_payment_status
      and m.settlement_status is distinct from 'released'::public.engagement_settlement_status
  ),
  received_prov as (
    select coalesce(sum(m.amount), 0) as amt, count(*)::bigint as cnt
    from mine m
    where m.provider_user_id = v_uid
      and m.settlement_status = 'released'::public.engagement_settlement_status
  ),
  refunded_req as (
    select coalesce(sum(m.amount), 0) as amt, count(*)::bigint as cnt
    from mine m
    where m.requester_user_id = v_uid
      and exists (
        select 1
        from public.engagement_payment_events e
        where e.payment_id = m.id
          and e.kind = 'refund'::public.engagement_payment_event_kind
          and e.status = 'success'::public.engagement_payment_event_status
      )
  )
  select
    funded_req.amt::text,
    locked_req.amt::text,
    received_prov.amt::text,
    refunded_req.amt::text,
    funded_req.cnt,
    locked_req.cnt,
    received_prov.cnt,
    refunded_req.cnt
  from funded_req, locked_req, received_prov, refunded_req;
end;
$$;

revoke all on function public.get_my_payment_summary() from public;
grant execute on function public.get_my_payment_summary() to authenticated;

create or replace function public.list_my_payment_activity(
  p_limit int default 20,
  p_offset int default 0,
  p_kind public.engagement_payment_event_kind default null,
  p_status public.engagement_payment_event_status default null
)
returns table (
  event_id uuid,
  payment_id uuid,
  engagement_id uuid,
  request_title text,
  viewer_role text,
  kind public.engagement_payment_event_kind,
  status public.engagement_payment_event_status,
  amount text,
  asset_symbol text,
  asset_decimals int,
  chain_id text,
  tx_hash text,
  occurred_at timestamptz,
  confirmed_at timestamptz,
  last_error text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_limit int := greatest(1, least(coalesce(p_limit, 20), 50));
  v_offset int := greatest(0, coalesce(p_offset, 0));
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  return query
  select
    e.id as event_id,
    e.payment_id,
    e.engagement_id,
    coalesce(req.title, 'Engagement') as request_title,
    case
      when ep.requester_user_id = v_uid then 'requester'
      else 'provider'
    end as viewer_role,
    e.kind,
    e.status,
    e.amount::text,
    a.symbol as asset_symbol,
    a.decimals as asset_decimals,
    e.chain_id,
    e.tx_hash,
    e.occurred_at,
    e.confirmed_at,
    e.last_error
  from public.engagement_payment_events e
  join public.engagement_escrow_payments ep on ep.id = e.payment_id
  join public.assets a on a.id = e.asset_id
  join public.engagements eng on eng.id = e.engagement_id
  join public.assignments asn on asn.id = eng.assignment_id
  join public.requests req on req.id = asn.request_id
  where (ep.requester_user_id = v_uid or ep.provider_user_id = v_uid)
    and (p_kind is null or e.kind = p_kind)
    and (p_status is null or e.status = p_status)
  order by e.occurred_at desc, e.id desc
  limit v_limit offset v_offset;
end;
$$;

revoke all on function public.list_my_payment_activity(
  int,
  int,
  public.engagement_payment_event_kind,
  public.engagement_payment_event_status
) from public;
grant execute on function public.list_my_payment_activity(
  int,
  int,
  public.engagement_payment_event_kind,
  public.engagement_payment_event_status
) to authenticated;

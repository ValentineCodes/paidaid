-- Payment activity summary: count received from payout events (milestones), expose primary asset for UI formatting.

drop function if exists public.get_my_payment_summary();

create function public.get_my_payment_summary()
returns table (
  total_funded_amount text,
  locked_in_escrow_amount text,
  total_received_amount text,
  total_refunded_amount text,
  funded_count bigint,
  locked_count bigint,
  received_count bigint,
  refund_count bigint,
  primary_asset_symbol text,
  primary_asset_decimals int,
  distinct_asset_count int
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
    select coalesce(sum(e.amount), 0) as amt, count(*)::bigint as cnt
    from public.engagement_payment_events e
    join mine m on m.id = e.payment_id
    where m.provider_user_id = v_uid
      and e.kind = 'payout'::public.engagement_payment_event_kind
      and e.status = 'success'::public.engagement_payment_event_status
  ),
  refunded_req as (
    select coalesce(sum(e.amount), 0) as amt, count(*)::bigint as cnt
    from public.engagement_payment_events e
    join mine m on m.id = e.payment_id
    where m.requester_user_id = v_uid
      and e.kind = 'refund'::public.engagement_payment_event_kind
      and e.status = 'success'::public.engagement_payment_event_status
  ),
  asset_stats as (
    select
      coalesce((select count(distinct m.asset_id)::int from mine m), 0) as asset_n,
      (
        select a.symbol
        from mine m2
        join public.assets a on a.id = m2.asset_id
        group by m2.asset_id, a.symbol, a.decimals
        order by sum(m2.amount) desc
        limit 1
      ) as sym,
      (
        select a.decimals
        from mine m2
        join public.assets a on a.id = m2.asset_id
        group by m2.asset_id, a.symbol, a.decimals
        order by sum(m2.amount) desc
        limit 1
      ) as dec
  )
  select
    funded_req.amt::text,
    locked_req.amt::text,
    received_prov.amt::text,
    refunded_req.amt::text,
    funded_req.cnt,
    locked_req.cnt,
    received_prov.cnt,
    refunded_req.cnt,
    coalesce(asset_stats.sym, 'NEAR'),
    coalesce(asset_stats.dec, 24),
    asset_stats.asset_n
  from funded_req, locked_req, received_prov, refunded_req, asset_stats;
end;
$$;

revoke all on function public.get_my_payment_summary() from public;
grant execute on function public.get_my_payment_summary() to authenticated;

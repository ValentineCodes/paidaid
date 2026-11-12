-- Allow a new release transaction hash after a failed verification attempt.
-- Successful releases stay immutable.

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
     and v_row.release_tx_hash <> p_release_tx_hash
     and v_row.settlement_status is distinct from 'release_failed'::public.engagement_settlement_status then
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

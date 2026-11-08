-- Escrow-only completion: funded payment required on approve and auto-complete.

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
    select * into v_pay
    from public.engagement_escrow_payments ep
    where ep.engagement_id = p_engagement_id;

    if not found then
      raise exception 'Fund escrow before approving delivery';
    end if;

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
  v_pay public.engagement_escrow_payments%rowtype;
begin
  for r in
    select e.id
    from public.engagements e
    where e.status = 'active'::public.engagement_status
      and e.auto_complete_deadline_at is not null
      and e.auto_complete_deadline_at <= now()
  loop
    select * into v_pay
    from public.engagement_escrow_payments ep
    where ep.engagement_id = r.id;

    if not found then
      continue;
    end if;

    if v_pay.status = 'funded'::public.engagement_payment_status then
      select public.mark_engagement_settlement_eligible(
        r.id,
        'auto_complete'::public.engagement_settlement_trigger
      ) into v_ok;
      if v_ok then
        n := n + 1;
      end if;
    end if;
  end loop;
  return n;
end;
$$;

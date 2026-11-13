-- Drop legacy review action `revision`; reject re-opens milestone. Normalize stuck rows.

update public.engagement_milestones
set status = 'active'::public.milestone_workflow_status,
    updated_at = now()
where status = 'revision_requested'::public.milestone_workflow_status;

create or replace function public.review_milestone_delivery(
  p_milestone_id uuid,
  p_action text,
  p_revision_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_m public.engagement_milestones%rowtype;
  v_intent public.acceptance_funding_intents%rowtype;
  v_pay public.engagement_escrow_payments%rowtype;
  v_eng_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_action not in ('approve', 'reject') then
    raise exception 'invalid action';
  end if;

  select * into v_m
  from public.engagement_milestones
  where id = p_milestone_id
  for update;

  if not found then
    raise exception 'milestone not found';
  end if;
  if v_m.status <> 'pending_review'::public.milestone_workflow_status then
    raise exception 'milestone is not pending review';
  end if;
  if v_m.engagement_id is null then
    raise exception 'engagement not active yet';
  end if;

  select * into v_intent from public.acceptance_funding_intents where id = v_m.acceptance_intent_id;

  if v_intent.requester_user_id is distinct from v_uid then
    raise exception 'only the requester may review';
  end if;

  v_eng_id := v_m.engagement_id;

  if exists (
    select 1 from public.engagement_issues i
    where i.engagement_id = v_eng_id
      and i.status = 'open'::public.issue_status
  ) then
    raise exception 'open issues block milestone approval';
  end if;

  if p_action = 'reject' then
    update public.engagement_milestones
    set status = 'active'::public.milestone_workflow_status,
        updated_at = now()
    where id = p_milestone_id;
    return true;
  end if;

  select * into v_pay
  from public.engagement_escrow_payments
  where id = v_intent.payment_id;

  if not found or v_pay.status <> 'funded'::public.engagement_payment_status then
    raise exception 'escrow not funded';
  end if;

  perform public.mark_milestone_settlement_eligible(p_milestone_id);

  update public.engagement_milestones
  set status = 'release_eligible'::public.milestone_workflow_status,
      updated_at = now()
  where id = p_milestone_id;

  return true;
end;
$$;

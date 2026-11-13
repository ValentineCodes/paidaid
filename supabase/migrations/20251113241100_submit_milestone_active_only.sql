-- Provider may submit only when milestone is active (not revision_requested).

create or replace function public.submit_milestone_delivery(
  p_milestone_id uuid,
  p_description text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_m public.engagement_milestones%rowtype;
  v_intent public.acceptance_funding_intents%rowtype;
  v_eng public.engagements%rowtype;
  v_body text;
  v_rev int;
  v_dlv_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  v_body := coalesce(trim(p_description), '');
  if char_length(v_body) > 4000 then
    raise exception 'description too long';
  end if;

  select * into v_m
  from public.engagement_milestones
  where id = p_milestone_id
  for update;

  if not found then
    raise exception 'milestone not found';
  end if;

  if v_m.status <> 'active'::public.milestone_workflow_status then
    raise exception 'milestone is not open for delivery';
  end if;

  if not public.prior_milestones_all_released(p_milestone_id) then
    raise exception 'previous milestones must be released first';
  end if;

  select * into v_intent
  from public.acceptance_funding_intents
  where id = v_m.acceptance_intent_id;

  if v_intent.provider_user_id is distinct from v_uid then
    raise exception 'only the provider may submit';
  end if;

  if not public.milestone_intent_is_funded(v_intent.id) then
    raise exception 'escrow must be funded before milestone delivery';
  end if;

  if v_m.engagement_id is null then
    raise exception 'engagement not active yet';
  end if;

  select * into v_eng from public.engagements where id = v_m.engagement_id;
  if v_eng.status <> 'active'::public.engagement_status then
    raise exception 'engagement not active';
  end if;

  if v_eng.payment_mode <> 'milestones'::public.engagement_payment_mode then
    raise exception 'not a milestone engagement';
  end if;

  select coalesce(max(revision_sequence), -1) + 1 into v_rev
  from public.milestone_deliveries
  where milestone_id = p_milestone_id;

  insert into public.milestone_deliveries (
    milestone_id, revision_sequence, description, provider_user_id
  )
  values (p_milestone_id, v_rev, v_body, v_uid)
  returning id into v_dlv_id;

  update public.engagement_milestones
  set status = 'pending_review'::public.milestone_workflow_status,
      updated_at = now()
  where id = p_milestone_id;

  return v_dlv_id;
end;
$$;

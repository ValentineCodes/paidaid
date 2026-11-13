-- Optional milestone engagements: schema, RPCs, payment events, auto-complete guard.
-- Safe additive migration; existing single-payment engagements default to payment_mode = single.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.engagement_payment_mode as enum ('single', 'milestones');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.milestone_workflow_status as enum (
    'locked',
    'active',
    'pending_review',
    'revision_requested',
    'release_eligible',
    'release_submitted',
    'released'
  );
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Payment mode on intents and engagements (default single)
-- ---------------------------------------------------------------------------
alter table public.acceptance_funding_intents
  add column if not exists payment_mode public.engagement_payment_mode
    not null default 'single'::public.engagement_payment_mode;

alter table public.engagements
  add column if not exists payment_mode public.engagement_payment_mode
    not null default 'single'::public.engagement_payment_mode;

-- ---------------------------------------------------------------------------
-- engagement_milestones
-- ---------------------------------------------------------------------------
create table if not exists public.engagement_milestones (
  id uuid primary key default gen_random_uuid(),
  acceptance_intent_id uuid not null
    references public.acceptance_funding_intents (id) on delete cascade,
  engagement_id uuid references public.engagements (id) on delete cascade,
  position smallint not null,
  title text not null,
  description text not null default '',
  amount numeric(78, 0) not null,
  status public.milestone_workflow_status not null default 'locked'::public.milestone_workflow_status,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint engagement_milestones_position_range check (
    position between 1 and 5
  ),
  constraint engagement_milestones_amount_positive check (amount > 0),
  constraint engagement_milestones_title_len check (
    char_length(trim(title)) between 1 and 200
  ),
  constraint engagement_milestones_description_len check (
    char_length(description) <= 4000
  )
);

create unique index if not exists engagement_milestones_intent_position_uniq
  on public.engagement_milestones (acceptance_intent_id, position);

create unique index if not exists engagement_milestones_engagement_position_uniq
  on public.engagement_milestones (engagement_id, position)
  where engagement_id is not null;

create unique index if not exists engagement_milestones_one_active_per_intent
  on public.engagement_milestones (acceptance_intent_id)
  where status = 'active'::public.milestone_workflow_status;

create index if not exists engagement_milestones_engagement_idx
  on public.engagement_milestones (engagement_id, position)
  where engagement_id is not null;

create index if not exists engagement_milestones_intent_idx
  on public.engagement_milestones (acceptance_intent_id, position);

create trigger engagement_milestones_set_updated_at
  before update on public.engagement_milestones
  for each row execute function public.set_profiles_updated_at();

-- ---------------------------------------------------------------------------
-- milestone_deliveries (unlimited revisions)
-- ---------------------------------------------------------------------------
create table if not exists public.milestone_deliveries (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid not null
    references public.engagement_milestones (id) on delete cascade,
  revision_sequence integer not null default 0,
  description text not null default '',
  provider_user_id uuid not null references public.profiles (id) on delete cascade,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint milestone_deliveries_description_len check (
    char_length(description) <= 4000
  ),
  constraint milestone_deliveries_revision_nonneg check (revision_sequence >= 0)
);

create unique index if not exists milestone_deliveries_milestone_revision_uniq
  on public.milestone_deliveries (milestone_id, revision_sequence);

create index if not exists milestone_deliveries_milestone_idx
  on public.milestone_deliveries (milestone_id, revision_sequence desc);

-- ---------------------------------------------------------------------------
-- milestone_delivery_attachments
-- ---------------------------------------------------------------------------
create table if not exists public.milestone_delivery_attachments (
  id uuid primary key default gen_random_uuid(),
  milestone_delivery_id uuid not null
    references public.milestone_deliveries (id) on delete cascade,
  storage_path text not null,
  mime_type text not null,
  byte_size bigint not null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  constraint milestone_delivery_attachments_byte_size check (
    byte_size > 0 and byte_size <= 26214400
  ),
  constraint milestone_delivery_attachments_mime_allowed check (
    mime_type in (
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'video/mp4',
      'video/webm'
    )
  )
);

create index if not exists milestone_delivery_attachments_delivery_idx
  on public.milestone_delivery_attachments (milestone_delivery_id);

create or replace function public.enforce_milestone_delivery_attachment_max_ten()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  cnt int;
begin
  select count(*) into cnt
  from public.milestone_delivery_attachments
  where milestone_delivery_id = new.milestone_delivery_id;
  if cnt >= 10 then
    raise exception 'A milestone delivery can have at most 10 attachments';
  end if;
  return new;
end;
$$;

drop trigger if exists milestone_delivery_attachments_max_ten
  on public.milestone_delivery_attachments;
create trigger milestone_delivery_attachments_max_ten
  before insert on public.milestone_delivery_attachments
  for each row execute function public.enforce_milestone_delivery_attachment_max_ten();

-- ---------------------------------------------------------------------------
-- engagement_milestone_releases (per-milestone settlement; service-role updates)
-- ---------------------------------------------------------------------------
create table if not exists public.engagement_milestone_releases (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid not null unique
    references public.engagement_milestones (id) on delete cascade,
  payment_id uuid not null
    references public.engagement_escrow_payments (id) on delete cascade,
  engagement_id uuid not null
    references public.engagements (id) on delete cascade,
  expected_amount numeric(78, 0) not null,
  settlement_status public.engagement_settlement_status
    not null default 'not_eligible'::public.engagement_settlement_status,
  settlement_eligible_at timestamptz,
  release_tx_hash text,
  released_at timestamptz,
  settlement_last_error text,
  tx_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint engagement_milestone_releases_amount_positive check (expected_amount > 0),
  constraint engagement_milestone_releases_tx_key_len check (char_length(tx_key) between 1 and 128)
);

create unique index if not exists engagement_milestone_releases_payment_tx_uniq
  on public.engagement_milestone_releases (payment_id, tx_key)
  where release_tx_hash is not null;

create index if not exists engagement_milestone_releases_engagement_idx
  on public.engagement_milestone_releases (engagement_id, milestone_id);

create trigger engagement_milestone_releases_set_updated_at
  before update on public.engagement_milestone_releases
  for each row execute function public.set_profiles_updated_at();

-- ---------------------------------------------------------------------------
-- RLS (participants read; no direct writes on settlement tables)
-- ---------------------------------------------------------------------------
alter table public.engagement_milestones enable row level security;
alter table public.milestone_deliveries enable row level security;
alter table public.milestone_delivery_attachments enable row level security;
alter table public.engagement_milestone_releases enable row level security;

drop policy if exists engagement_milestones_select_participants
  on public.engagement_milestones;
create policy engagement_milestones_select_participants
  on public.engagement_milestones for select
  to authenticated
  using (
    exists (
      select 1 from public.acceptance_funding_intents i
      where i.id = engagement_milestones.acceptance_intent_id
        and (
          i.requester_user_id = auth.uid()
          or i.provider_user_id = auth.uid()
        )
    )
    or (
      engagement_id is not null
      and public.is_engagement_participant(engagement_id, auth.uid())
    )
  );

drop policy if exists milestone_deliveries_select_participants
  on public.milestone_deliveries;
create policy milestone_deliveries_select_participants
  on public.milestone_deliveries for select
  to authenticated
  using (
    exists (
      select 1
      from public.engagement_milestones m
      join public.acceptance_funding_intents i on i.id = m.acceptance_intent_id
      where m.id = milestone_deliveries.milestone_id
        and (
          i.requester_user_id = auth.uid()
          or i.provider_user_id = auth.uid()
        )
    )
    or exists (
      select 1
      from public.engagement_milestones m
      where m.id = milestone_deliveries.milestone_id
        and m.engagement_id is not null
        and public.is_engagement_participant(m.engagement_id, auth.uid())
    )
  );

drop policy if exists milestone_delivery_attachments_select_participants
  on public.milestone_delivery_attachments;
create policy milestone_delivery_attachments_select_participants
  on public.milestone_delivery_attachments for select
  to authenticated
  using (
    exists (
      select 1
      from public.milestone_deliveries d
      join public.engagement_milestones m on m.id = d.milestone_id
      join public.acceptance_funding_intents i on i.id = m.acceptance_intent_id
      where d.id = milestone_delivery_attachments.milestone_delivery_id
        and (
          i.requester_user_id = auth.uid()
          or i.provider_user_id = auth.uid()
        )
    )
  );

drop policy if exists engagement_milestone_releases_select_participants
  on public.engagement_milestone_releases;
create policy engagement_milestone_releases_select_participants
  on public.engagement_milestone_releases for select
  to authenticated
  using (public.is_engagement_participant(engagement_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- Immutability: frozen milestone schedule after funding
-- ---------------------------------------------------------------------------
create or replace function public.prevent_funded_milestone_terms_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_pay public.engagement_escrow_payments%rowtype;
  v_intent public.acceptance_funding_intents%rowtype;
begin
  select * into v_intent
  from public.acceptance_funding_intents
  where id = old.acceptance_intent_id;

  if v_intent.payment_id is not null then
    select * into v_pay
    from public.engagement_escrow_payments
    where id = v_intent.payment_id;

    if found and v_pay.status = 'funded'::public.engagement_payment_status then
      if new.amount is distinct from old.amount
         or new.position is distinct from old.position
         or new.title is distinct from old.title
         or new.description is distinct from old.description
         or new.acceptance_intent_id is distinct from old.acceptance_intent_id then
        raise exception 'funded milestone terms are immutable';
      end if;
    end if;
  end if;

  if v_intent.status in (
    'funding_verified'::public.acceptance_funding_intent_status,
    'finalized'::public.acceptance_funding_intent_status
  ) then
    if new.amount is distinct from old.amount
       or new.position is distinct from old.position
       or new.title is distinct from old.title
       or new.description is distinct from old.description then
      raise exception 'milestone terms are frozen after funding verification';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists engagement_milestones_funded_terms_immutable
  on public.engagement_milestones;
create trigger engagement_milestones_funded_terms_immutable
  before update on public.engagement_milestones
  for each row execute function public.prevent_funded_milestone_terms_mutation();

create or replace function public.prevent_milestone_delete_after_funded()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_intent public.acceptance_funding_intents%rowtype;
begin
  select * into v_intent
  from public.acceptance_funding_intents
  where id = old.acceptance_intent_id;

  if v_intent.status not in (
    'awaiting_wallet'::public.acceptance_funding_intent_status
  ) then
    raise exception 'cannot delete milestones after funding started';
  end if;
  return old;
end;
$$;

drop trigger if exists engagement_milestones_no_delete_after_fund
  on public.engagement_milestones;
create trigger engagement_milestones_no_delete_after_fund
  before delete on public.engagement_milestones
  for each row execute function public.prevent_milestone_delete_after_funded();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.milestone_intent_is_funded(p_intent_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.acceptance_funding_intents i
    join public.engagement_escrow_payments p on p.id = i.payment_id
    where i.id = p_intent_id
      and p.status = 'funded'::public.engagement_payment_status
  );
$$;

revoke all on function public.milestone_intent_is_funded(uuid) from public;
grant execute on function public.milestone_intent_is_funded(uuid) to service_role;

create or replace function public.prior_milestones_all_released(p_milestone_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_m public.engagement_milestones%rowtype;
begin
  select * into v_m from public.engagement_milestones where id = p_milestone_id;
  if not found then
    return false;
  end if;
  if v_m.position <= 1 then
    return true;
  end if;
  return not exists (
    select 1
    from public.engagement_milestones m
    where m.acceptance_intent_id = v_m.acceptance_intent_id
      and m.position < v_m.position
      and m.status is distinct from 'released'::public.milestone_workflow_status
  );
end;
$$;

revoke all on function public.prior_milestones_all_released(uuid) from public;
grant execute on function public.prior_milestones_all_released(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- save_acceptance_milestone_schedule (requester, before funding)
-- ---------------------------------------------------------------------------
create or replace function public.save_acceptance_milestone_schedule(
  p_intent_id uuid,
  p_milestones jsonb
)
returns setof public.engagement_milestones
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_intent public.acceptance_funding_intents%rowtype;
  v_elem jsonb;
  v_cnt int := 0;
  v_sum numeric(78, 0) := 0;
  v_pos smallint;
  v_amount numeric(78, 0);
  v_title text;
  v_desc text;
  v_row public.engagement_milestones%rowtype;
  v_positions int[] := '{}';
  v_i int;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_milestones is null or jsonb_typeof(p_milestones) <> 'array' then
    raise exception 'milestones must be a json array';
  end if;

  select * into v_intent
  from public.acceptance_funding_intents
  where id = p_intent_id
  for update;

  if not found then
    raise exception 'intent not found';
  end if;
  if v_intent.requester_user_id is distinct from v_uid then
    raise exception 'only the requester may set milestones';
  end if;
  if v_intent.status is distinct from 'awaiting_wallet'::public.acceptance_funding_intent_status then
    raise exception 'milestone schedule can only be saved before funding';
  end if;

  v_cnt := jsonb_array_length(p_milestones);
  if v_cnt < 2 or v_cnt > 5 then
    raise exception 'milestones count must be between 2 and 5';
  end if;

  delete from public.engagement_milestones
  where acceptance_intent_id = p_intent_id;

  for v_elem in select value from jsonb_array_elements(p_milestones) loop
    v_pos := (v_elem ->> 'position')::smallint;
    if v_pos is null or v_pos < 1 or v_pos > 5 then
      raise exception 'invalid milestone position';
    end if;
    if v_pos = any (v_positions) then
      raise exception 'duplicate milestone position';
    end if;
    v_positions := array_append(v_positions, v_pos::int);

    v_title := trim(coalesce(v_elem ->> 'title', ''));
    if v_title = '' or char_length(v_title) > 200 then
      raise exception 'invalid milestone title';
    end if;

    v_desc := coalesce(v_elem ->> 'description', '');
    if char_length(v_desc) > 4000 then
      raise exception 'milestone description too long';
    end if;

    begin
      v_amount := (v_elem ->> 'amount')::numeric(78, 0);
    exception
      when others then
        raise exception 'milestone amount must be an integer string in smallest units';
    end;
    if v_amount is null or v_amount <= 0 or trunc(v_amount) <> v_amount then
      raise exception 'milestone amount must be a positive integer';
    end if;

    v_sum := v_sum + v_amount;
  end loop;

  if v_sum <> v_intent.amount then
    raise exception 'milestone amounts must sum to acceptance budget';
  end if;

  if v_cnt <> coalesce(array_length(v_positions, 1), 0) then
    raise exception 'duplicate milestone position';
  end if;
  for v_i in 1 .. v_cnt loop
    if not (v_i = any (v_positions)) then
      raise exception 'milestone positions must be contiguous from 1';
    end if;
  end loop;

  update public.acceptance_funding_intents
  set payment_mode = 'milestones'::public.engagement_payment_mode,
      updated_at = now()
  where id = p_intent_id;

  for v_elem in
    select value
    from jsonb_array_elements(p_milestones)
    order by (value ->> 'position')::int
  loop
    v_pos := (v_elem ->> 'position')::smallint;
    v_title := trim(v_elem ->> 'title');
    v_desc := coalesce(v_elem ->> 'description', '');
    v_amount := (v_elem ->> 'amount')::numeric(78, 0);

    insert into public.engagement_milestones (
      acceptance_intent_id,
      position,
      title,
      description,
      amount,
      status
    )
    values (
      p_intent_id,
      v_pos,
      v_title,
      v_desc,
      v_amount,
      case
        when v_pos = 1 then 'active'::public.milestone_workflow_status
        else 'locked'::public.milestone_workflow_status
      end
    )
    returning * into v_row;

    return next v_row;
  end loop;
end;
$$;

revoke all on function public.save_acceptance_milestone_schedule(uuid, jsonb) from public;
grant execute on function public.save_acceptance_milestone_schedule(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- submit_milestone_delivery
-- ---------------------------------------------------------------------------
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

  if v_m.status not in (
    'active'::public.milestone_workflow_status,
    'revision_requested'::public.milestone_workflow_status
  ) then
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

revoke all on function public.submit_milestone_delivery(uuid, text) from public;
grant execute on function public.submit_milestone_delivery(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- review_milestone_delivery (approve → release_eligible; revision unlimited)
-- ---------------------------------------------------------------------------
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
  if p_action not in ('approve', 'revision') then
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

  if p_action = 'revision' then
    if p_revision_note is null or trim(p_revision_note) = '' then
      raise exception 'revision note required';
    end if;
    if char_length(trim(p_revision_note)) > 2000 then
      raise exception 'note too long';
    end if;

    update public.engagement_milestones
    set status = 'revision_requested'::public.milestone_workflow_status,
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

revoke all on function public.review_milestone_delivery(uuid, text, text) from public;
grant execute on function public.review_milestone_delivery(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- mark_milestone_settlement_eligible (service_role / definer; called from review)
-- ---------------------------------------------------------------------------
create or replace function public.mark_milestone_settlement_eligible(p_milestone_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m public.engagement_milestones%rowtype;
  v_intent public.acceptance_funding_intents%rowtype;
  v_pay public.engagement_escrow_payments%rowtype;
  v_rel public.engagement_milestone_releases%rowtype;
  v_eng_id uuid;
begin
  select * into v_m from public.engagement_milestones where id = p_milestone_id for update;
  if not found then
    return false;
  end if;

  select * into v_intent from public.acceptance_funding_intents where id = v_m.acceptance_intent_id;
  select * into v_pay from public.engagement_escrow_payments where id = v_intent.payment_id;

  if not found or v_pay.status <> 'funded'::public.engagement_payment_status then
    return false;
  end if;

  v_eng_id := coalesce(v_m.engagement_id, v_pay.engagement_id, v_intent.planned_engagement_id);
  if v_eng_id is null then
    return false;
  end if;

  select * into v_rel from public.engagement_milestone_releases where milestone_id = p_milestone_id;

  if not found then
    insert into public.engagement_milestone_releases (
      milestone_id,
      payment_id,
      engagement_id,
      expected_amount,
      settlement_status,
      settlement_eligible_at,
      tx_key
    )
  values (
      p_milestone_id,
      v_pay.id,
      v_eng_id,
      v_m.amount,
      'eligible'::public.engagement_settlement_status,
      now(),
      'milestone:' || p_milestone_id::text
    );
  else
    if v_rel.settlement_status in (
      'eligible'::public.engagement_settlement_status,
      'release_submitted'::public.engagement_settlement_status,
      'released'::public.engagement_settlement_status
    ) then
      return true;
    end if;

    update public.engagement_milestone_releases
    set
      settlement_status = 'eligible'::public.engagement_settlement_status,
      settlement_eligible_at = now(),
      settlement_last_error = null,
      updated_at = now()
    where milestone_id = p_milestone_id;
  end if;

  return true;
end;
$$;

revoke all on function public.mark_milestone_settlement_eligible(uuid) from public;
grant execute on function public.mark_milestone_settlement_eligible(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- record_milestone_settlement_progress (service_role only)
-- ---------------------------------------------------------------------------
create or replace function public.record_milestone_settlement_progress(
  p_milestone_id uuid,
  p_status public.engagement_settlement_status,
  p_release_tx_hash text default null,
  p_last_error text default null
)
returns public.engagement_milestone_releases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rel public.engagement_milestone_releases%rowtype;
  v_m public.engagement_milestones%rowtype;
  v_next public.engagement_milestones%rowtype;
begin
  select * into v_rel
  from public.engagement_milestone_releases
  where milestone_id = p_milestone_id
  for update;

  if not found then
    raise exception 'milestone release row not found';
  end if;

  if v_rel.settlement_status = 'released'::public.engagement_settlement_status
     and p_status is distinct from 'released'::public.engagement_settlement_status then
    raise exception 'cannot regress released milestone settlement';
  end if;

  if v_rel.settlement_status = 'released'::public.engagement_settlement_status
     and p_status = 'released'::public.engagement_settlement_status then
    return v_rel;
  end if;

  if p_release_tx_hash is not null
     and v_rel.release_tx_hash is not null
     and v_rel.release_tx_hash <> p_release_tx_hash
     and v_rel.settlement_status is distinct from 'release_failed'::public.engagement_settlement_status then
    raise exception 'release tx hash already set';
  end if;

  update public.engagement_milestone_releases
  set
    settlement_status = p_status,
    release_tx_hash = coalesce(p_release_tx_hash, release_tx_hash),
    settlement_last_error = p_last_error,
    released_at = case
      when p_status = 'released'::public.engagement_settlement_status
      then coalesce(released_at, now())
      else released_at
    end,
    tx_key = case
      when p_release_tx_hash is not null then p_release_tx_hash
      else tx_key
    end,
    updated_at = now()
  where milestone_id = p_milestone_id
  returning * into v_rel;

  if p_status = 'released'::public.engagement_settlement_status then
    select * into v_m from public.engagement_milestones where id = p_milestone_id for update;

    update public.engagement_milestones
    set status = 'released'::public.milestone_workflow_status,
        updated_at = now()
    where id = p_milestone_id;

    select * into v_next
    from public.engagement_milestones m
    where m.acceptance_intent_id = v_m.acceptance_intent_id
      and m.position = v_m.position + 1
    for update;

    if found then
      update public.engagement_milestones
      set status = 'active'::public.milestone_workflow_status,
          updated_at = now()
      where id = v_next.id;
    else
      perform public.complete_engagement_after_milestone_settlement(v_rel.engagement_id);
    end if;

    perform public.sync_engagement_payment_events(v_rel.payment_id);
  end if;

  return v_rel;
end;
$$;

revoke all on function public.record_milestone_settlement_progress(
  uuid,
  public.engagement_settlement_status,
  text,
  text
) from public;
grant execute on function public.record_milestone_settlement_progress(
  uuid,
  public.engagement_settlement_status,
  text,
  text
) to service_role;

-- ---------------------------------------------------------------------------
-- complete_engagement_after_milestone_settlement (service_role)
-- ---------------------------------------------------------------------------
create or replace function public.complete_engagement_after_milestone_settlement(
  p_engagement_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eng public.engagements%rowtype;
  v_asn public.assignments%rowtype;
begin
  if not exists (
    select 1 from public.engagements e
    where e.id = p_engagement_id
      and e.payment_mode = 'milestones'::public.engagement_payment_mode
  ) then
    return false;
  end if;

  if exists (
    select 1
    from public.engagement_milestones m
    join public.acceptance_funding_intents i on i.id = m.acceptance_intent_id
    where (m.engagement_id = p_engagement_id or i.planned_engagement_id = p_engagement_id)
      and m.status is distinct from 'released'::public.milestone_workflow_status
  ) then
    return false;
  end if;

  select * into v_eng from public.engagements where id = p_engagement_id for update;
  if not found or v_eng.status <> 'active'::public.engagement_status then
    return false;
  end if;

  if exists (
    select 1 from public.engagement_issues i
    where i.engagement_id = p_engagement_id and i.status = 'open'::public.issue_status
  ) then
    return false;
  end if;

  select * into v_asn from public.assignments where id = v_eng.assignment_id;

  update public.engagements
  set
    status = 'completed'::public.engagement_status,
    completed_at = now(),
    auto_complete_deadline_at = null
  where id = p_engagement_id;

  update public.requests
  set status = 'completed'::public.request_status
  where id = v_asn.request_id;

  return true;
end;
$$;

revoke all on function public.complete_engagement_after_milestone_settlement(uuid) from public;
grant execute on function public.complete_engagement_after_milestone_settlement(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- add_milestone_delivery_attachments
-- ---------------------------------------------------------------------------
create or replace function public.add_milestone_delivery_attachments(
  p_milestone_delivery_id uuid,
  p_paths text[],
  p_mime_types text[],
  p_byte_sizes bigint[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_dlv public.milestone_deliveries%rowtype;
  v_i int;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if array_length(p_paths, 1) is distinct from array_length(p_mime_types, 1)
     or array_length(p_paths, 1) is distinct from array_length(p_byte_sizes, 1) then
    raise exception 'attachment arrays length mismatch';
  end if;

  select * into v_dlv from public.milestone_deliveries where id = p_milestone_delivery_id;
  if not found or v_dlv.provider_user_id is distinct from v_uid then
    raise exception 'delivery not found';
  end if;

  for v_i in 1 .. coalesce(array_length(p_paths, 1), 0) loop
    insert into public.milestone_delivery_attachments (
      milestone_delivery_id, storage_path, mime_type, byte_size, sort_order
    )
    values (
      p_milestone_delivery_id,
      p_paths[v_i],
      p_mime_types[v_i],
      p_byte_sizes[v_i],
      v_i - 1
    );
  end loop;
end;
$$;

revoke all on function public.add_milestone_delivery_attachments(uuid, text[], text[], bigint[]) from public;
grant execute on function public.add_milestone_delivery_attachments(uuid, text[], text[], bigint[]) to authenticated;

-- ---------------------------------------------------------------------------
-- finalize_acceptance_after_funding — bind milestones to engagement
-- ---------------------------------------------------------------------------
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

  if v_pay.on_chain_escrow_id is null then
    raise exception 'payment missing on_chain_escrow_id';
  end if;

  if v_pay.fund_tx_hash is null and v_pay.create_tx_hash is null then
    raise exception 'payment missing funding transaction hash';
  end if;

  if v_intent.payment_mode = 'milestones'::public.engagement_payment_mode then
    if (
      select count(*)::int
      from public.engagement_milestones m
      where m.acceptance_intent_id = p_intent_id
    ) not between 2 and 5 then
      raise exception 'milestone schedule must have 2 to 5 milestones';
    end if;
    if (
      select coalesce(sum(m.amount), 0)
      from public.engagement_milestones m
      where m.acceptance_intent_id = p_intent_id
    ) <> v_intent.amount then
      raise exception 'milestone amounts must equal budget';
    end if;
  end if;

  perform public.accept_response_with_ids(
    v_intent.request_id,
    v_intent.response_id,
    v_intent.planned_assignment_id,
    v_intent.planned_engagement_id
  );

  update public.engagements
  set payment_mode = v_intent.payment_mode,
      updated_at = now()
  where id = v_intent.planned_engagement_id;

  update public.engagement_escrow_payments
  set
    engagement_id = v_intent.planned_engagement_id,
    request_id = coalesce(request_id, v_intent.request_id),
    response_id = coalesce(response_id, v_intent.response_id),
    updated_at = now()
  where id = v_intent.payment_id;

  update public.engagement_milestones
  set engagement_id = v_intent.planned_engagement_id,
      updated_at = now()
  where acceptance_intent_id = p_intent_id
    and engagement_id is null;

  update public.acceptance_funding_intents
  set status = 'finalized',
      finalized_at = now(),
      updated_at = now()
  where id = p_intent_id;

  perform public.sync_engagement_payment_events(v_intent.payment_id);

  return v_intent.planned_engagement_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- sync_engagement_payment_events — multiple milestone payouts
-- ---------------------------------------------------------------------------
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
  v_mode public.engagement_payment_mode := 'single'::public.engagement_payment_mode;
  v_rel record;
begin
  select * into v_pay
  from public.engagement_escrow_payments ep
  where ep.id = p_payment_id;

  if not found then
    return;
  end if;

  if v_pay.engagement_id is not null then
    select e.payment_mode into v_mode
    from public.engagements e
    where e.id = v_pay.engagement_id;
  elsif v_pay.acceptance_intent_id is not null then
    select i.payment_mode into v_mode
    from public.acceptance_funding_intents i
    where i.id = v_pay.acceptance_intent_id;
  end if;

  -- Funding event (unchanged).
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
    else
      v_fund_status := 'pending'::public.engagement_payment_event_status;
    end if;

    insert into public.engagement_payment_events (
      payment_id, engagement_id, kind, status, amount, asset_id, chain_id,
      tx_hash, tx_key, occurred_at, confirmed_at, last_error
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
      case when v_pay.status = 'funded' then v_pay.funded_at else null end,
      case when v_pay.status = 'failed' then v_pay.last_error else null end
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

  if v_mode = 'milestones'::public.engagement_payment_mode then
    for v_rel in
      select r.*, m.position
      from public.engagement_milestone_releases r
      join public.engagement_milestones m on m.id = r.milestone_id
      where r.payment_id = p_payment_id
      order by m.position
    loop
      if v_rel.settlement_status = 'released'::public.engagement_settlement_status then
        v_payout_status := 'success'::public.engagement_payment_event_status;
      elsif v_rel.settlement_status = 'release_failed'::public.engagement_settlement_status then
        v_payout_status := 'failed'::public.engagement_payment_event_status;
      elsif v_rel.settlement_status = 'release_submitted'::public.engagement_settlement_status then
        v_payout_status := 'pending'::public.engagement_payment_event_status;
      else
        v_payout_status := 'pending'::public.engagement_payment_event_status;
      end if;

      insert into public.engagement_payment_events (
        payment_id, engagement_id, kind, status, amount, asset_id, chain_id,
        tx_hash, tx_key, occurred_at, confirmed_at, last_error
      )
      values (
        v_pay.id,
        v_rel.engagement_id,
        'payout'::public.engagement_payment_event_kind,
        v_payout_status,
        v_rel.expected_amount,
        v_pay.asset_id,
        v_pay.chain_id,
        v_rel.release_tx_hash,
        v_rel.tx_key,
        coalesce(v_rel.released_at, v_rel.settlement_eligible_at, now()),
        case when v_rel.settlement_status = 'released' then v_rel.released_at else null end,
        case when v_rel.settlement_status = 'release_failed' then v_rel.settlement_last_error else null end
      )
      on conflict (payment_id, kind, tx_key)
      do update set
        status = excluded.status,
        amount = excluded.amount,
        engagement_id = excluded.engagement_id,
        tx_hash = excluded.tx_hash,
        occurred_at = excluded.occurred_at,
        confirmed_at = excluded.confirmed_at,
        last_error = excluded.last_error,
        updated_at = now();
    end loop;
    return;
  end if;

  -- Single-payment payout projection (unchanged).
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
    else
      v_payout_status := 'pending'::public.engagement_payment_event_status;
    end if;

    insert into public.engagement_payment_events (
      payment_id, engagement_id, kind, status, amount, asset_id, chain_id,
      tx_hash, tx_key, occurred_at, confirmed_at, last_error
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
      case when v_pay.settlement_status = 'released' then v_pay.released_at else null end,
      case when v_pay.settlement_status = 'release_failed' then v_pay.settlement_last_error else null end
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

-- ---------------------------------------------------------------------------
-- auto_complete_engagements — skip milestone engagements (no auto-approve MVP)
-- ---------------------------------------------------------------------------
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
    select e.id, e.payment_mode
    from public.engagements e
    where e.status = 'active'::public.engagement_status
      and e.auto_complete_deadline_at is not null
      and e.auto_complete_deadline_at <= now()
  loop
    if r.payment_mode = 'milestones'::public.engagement_payment_mode then
      continue;
    end if;

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

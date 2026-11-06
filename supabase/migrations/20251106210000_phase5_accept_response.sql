-- Phase 5: assignments, engagements, notifications, accept_response RPC,
-- promote pre_accept conversation to engagement, RLS.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.engagement_status as enum ('active', 'completed');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.notification_kind as enum (
    'request_new_response',
    'response_accepted',
    'response_rejected'
  );
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- assignments
-- ---------------------------------------------------------------------------
create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.requests (id) on delete cascade,
  accepted_response_id uuid not null unique references public.request_responses (id) on delete restrict,
  requester_id uuid not null references public.profiles (id) on delete cascade,
  provider_user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists assignments_provider_user_id on public.assignments (provider_user_id);

-- ---------------------------------------------------------------------------
-- engagements
-- ---------------------------------------------------------------------------
create table public.engagements (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null unique references public.assignments (id) on delete cascade,
  provider_user_id uuid not null references public.profiles (id) on delete cascade,
  status public.engagement_status not null default 'active',
  scheduled_for_day date not null,
  completed_at timestamptz,
  auto_completed_at timestamptz,
  auto_complete_deadline_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists engagements_provider_scheduled_active
  on public.engagements (provider_user_id, scheduled_for_day)
  where status = 'active';

create unique index if not exists engagements_one_active_per_provider_day
  on public.engagements (provider_user_id, scheduled_for_day)
  where status = 'active';

create trigger engagements_set_updated_at
  before update on public.engagements
  for each row execute function public.set_profiles_updated_at();

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.notification_kind not null,
  title text not null,
  body text,
  read_at timestamptz,
  request_id uuid references public.requests (id) on delete set null,
  response_id uuid references public.request_responses (id) on delete set null,
  engagement_id uuid references public.engagements (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_id_created_at
  on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- conversations: allow engagement rows; promote pre_accept → engagement
-- ---------------------------------------------------------------------------
alter table public.conversations
  drop constraint if exists conversations_phase4_no_engagement_rows;

alter table public.conversations
  add constraint conversations_engagement_requires_engagement_id check (
    kind <> 'engagement' or engagement_id is not null
  );

alter table public.conversations
  add constraint conversations_engagement_response_null check (
    kind <> 'engagement' or response_id is null
  );

alter table public.conversations
  add constraint conversations_pre_accept_response_required check (
    kind <> 'pre_accept' or response_id is not null
  );

create unique index if not exists conversations_unique_engagement
  on public.conversations (engagement_id)
  where kind = 'engagement' and engagement_id is not null;

alter table public.conversations
  drop constraint if exists conversations_engagement_id_fkey;

alter table public.conversations
  add constraint conversations_engagement_id_fkey
  foreign key (engagement_id) references public.engagements (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- RLS: assignments
-- ---------------------------------------------------------------------------
alter table public.assignments enable row level security;

drop policy if exists "assignments_select_participants" on public.assignments;
create policy "assignments_select_participants"
  on public.assignments for select
  to authenticated
  using (
    requester_id = auth.uid()
    or provider_user_id = auth.uid()
  );

drop policy if exists "assignments_no_mutate" on public.assignments;
create policy "assignments_no_mutate"
  on public.assignments for all
  to authenticated
  using (false)
  with check (false);

-- ---------------------------------------------------------------------------
-- RLS: engagements
-- ---------------------------------------------------------------------------
alter table public.engagements enable row level security;

drop policy if exists "engagements_select_via_assignment" on public.engagements;
create policy "engagements_select_via_assignment"
  on public.engagements for select
  to authenticated
  using (
    exists (
      select 1 from public.assignments a
      where a.id = engagements.assignment_id
        and (a.requester_id = auth.uid() or a.provider_user_id = auth.uid())
    )
  );

drop policy if exists "engagements_no_mutate" on public.engagements;
create policy "engagements_no_mutate"
  on public.engagements for all
  to authenticated
  using (false)
  with check (false);

-- ---------------------------------------------------------------------------
-- RLS: notifications
-- ---------------------------------------------------------------------------
alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "notifications_no_insert" on public.notifications;
create policy "notifications_no_insert"
  on public.notifications for insert
  to authenticated
  with check (false);

drop policy if exists "notifications_no_update" on public.notifications;
create policy "notifications_no_update"
  on public.notifications for update
  to authenticated
  using (false)
  with check (false);

drop policy if exists "notifications_no_delete" on public.notifications;
create policy "notifications_no_delete"
  on public.notifications for delete
  to authenticated
  using (false);

grant select on public.assignments to authenticated;
grant select on public.engagements to authenticated;
grant select on public.notifications to authenticated;

-- ---------------------------------------------------------------------------
-- conversations RLS (replace for engagement participant path)
-- ---------------------------------------------------------------------------
drop policy if exists "conversations_select_participants" on public.conversations;
create policy "conversations_select_participants"
  on public.conversations for select
  to authenticated
  using (
    exists (
      select 1 from public.requests r
      where r.id = conversations.request_id
        and r.requester_id = auth.uid()
    )
    or (
      kind = 'pre_accept'
      and response_id is not null
      and exists (
        select 1 from public.request_responses rr
        join public.provider_profiles pp on pp.id = rr.provider_profile_id
        where rr.id = conversations.response_id
          and pp.user_id = auth.uid()
      )
    )
    or (
      kind = 'engagement'
      and engagement_id is not null
      and exists (
        select 1 from public.engagements e
        join public.assignments a on a.id = e.assignment_id
        where e.id = conversations.engagement_id
          and (a.requester_id = auth.uid() or a.provider_user_id = auth.uid())
      )
    )
  );

-- ---------------------------------------------------------------------------
-- accept_response
-- Same calendar date uses UTC (single server timezone for V1; see v1-data-model unresolved).
-- ---------------------------------------------------------------------------
create or replace function public.accept_response(
  p_request_id uuid,
  p_response_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.requests%rowtype;
  v_rr public.request_responses%rowtype;
  v_provider_uid uuid;
  v_pp_rec public.provider_profiles%rowtype;
  v_scheduled_day date;
  v_assignment_id uuid := gen_random_uuid();
  v_engagement_id uuid := gen_random_uuid();
  v_existing_assignment public.assignments%rowtype;
  v_promote_count int;
  v_rej_ids uuid[];
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_req from public.requests where id = p_request_id for update;
  if not found then
    raise exception 'Request not found';
  end if;

  if v_req.requester_id is distinct from v_uid then
    raise exception 'Only the request owner can accept a response';
  end if;

  if v_req.expires_at is not null and v_req.expires_at <= now() then
    raise exception 'Request has expired';
  end if;

  if v_req.status = 'assigned' then
    select * into v_existing_assignment
    from public.assignments
    where request_id = p_request_id;
    if found and v_existing_assignment.accepted_response_id = p_response_id then
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
  if not found then
    raise exception 'Response not found';
  end if;

  if v_rr.request_id is distinct from p_request_id then
    raise exception 'Response does not belong to this request';
  end if;

  if v_rr.status is distinct from 'pending' then
    raise exception 'Response is not pending';
  end if;

  select array_agg(rr.id) into v_rej_ids
  from public.request_responses rr
  where rr.request_id = p_request_id
    and rr.status = 'pending'
    and rr.id <> p_response_id;

  select * into v_pp_rec
  from public.provider_profiles pp
  where pp.id = v_rr.provider_profile_id
  for update;
  if not found then
    raise exception 'Provider profile not found';
  end if;
  v_provider_uid := v_pp_rec.user_id;

  if v_provider_uid = v_req.requester_id then
    raise exception 'Invalid provider for this request';
  end if;

  if v_req.timing_type = 'scheduled' and v_req.scheduled_at is not null then
    v_scheduled_day := (v_req.scheduled_at at time zone 'UTC')::date;
  else
    v_scheduled_day := (timezone('UTC', now()))::date;
  end if;

  if exists (
    select 1
    from public.engagements e
    where e.provider_user_id = v_provider_uid
      and e.status = 'active'
      and e.scheduled_for_day = v_scheduled_day
  ) then
    raise exception 'Provider already has an active engagement on this date';
  end if;

  update public.request_responses
  set status = 'rejected', updated_at = now()
  where request_id = p_request_id
    and status = 'pending'
    and id <> p_response_id;

  update public.request_responses
  set status = 'accepted', updated_at = now()
  where id = p_response_id;

  insert into public.assignments (
    id,
    request_id,
    accepted_response_id,
    requester_id,
    provider_user_id
  ) values (
    v_assignment_id,
    p_request_id,
    p_response_id,
    v_req.requester_id,
    v_provider_uid
  );

  insert into public.engagements (
    id,
    assignment_id,
    status,
    scheduled_for_day,
    provider_user_id
  ) values (
    v_engagement_id,
    v_assignment_id,
    'active',
    v_scheduled_day,
    v_provider_uid
  );

  update public.conversations c
  set
    kind = 'engagement'::public.conversation_kind,
    engagement_id = v_engagement_id,
    response_id = null,
    updated_at = now()
  where c.request_id = p_request_id
    and c.kind = 'pre_accept'
    and c.response_id = p_response_id;
  get diagnostics v_promote_count = row_count;

  if v_promote_count = 0 then
    insert into public.conversations (request_id, kind, engagement_id, response_id)
    values (p_request_id, 'engagement', v_engagement_id, null);
  end if;

  update public.requests
  set status = 'assigned', updated_at = now()
  where id = p_request_id;

  insert into public.notifications (user_id, kind, title, body, request_id, response_id, engagement_id)
  values (
    v_provider_uid,
    'response_accepted'::public.notification_kind,
    'Your offer was accepted',
    'You have been assigned to a request.',
    p_request_id,
    p_response_id,
    v_engagement_id
  );

  if v_rej_ids is not null and array_length(v_rej_ids, 1) is not null then
    insert into public.notifications (user_id, kind, title, body, request_id, response_id)
    select
      pp.user_id,
      'response_rejected'::public.notification_kind,
      'Another offer was accepted',
      'Your pending offer was not selected for this request.',
      p_request_id,
      rid
    from unnest(v_rej_ids) as rid
    join public.request_responses rr on rr.id = rid
    join public.provider_profiles pp on pp.id = rr.provider_profile_id;
  end if;
end;
$$;

revoke all on function public.accept_response(uuid, uuid) from public;
grant execute on function public.accept_response(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- submit_request_response: notify requester of new response
-- ---------------------------------------------------------------------------
create or replace function public.submit_request_response(
  p_request_id uuid,
  p_message text,
  p_proposed_amount numeric,
  p_headline text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.requests%rowtype;
  v_cfg boolean;
  v_pp_id uuid;
  v_pp_record public.provider_profiles%rowtype;
  v_decimals smallint;
  v_factor numeric;
  v_response_id uuid := gen_random_uuid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_req from public.requests where id = p_request_id for update;
  if not found then
    raise exception 'Request not found';
  end if;

  if v_req.requester_id = v_uid then
    raise exception 'Cannot respond to your own request';
  end if;

  if v_req.status <> 'open' then
    raise exception 'Request is not open';
  end if;

  if v_req.expires_at is not null and v_req.expires_at <= now() then
    raise exception 'Request has expired';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_uid
      and p.live_profile_photo_path is not null
      and p.live_profile_photo_captured_at is not null
  ) then
    raise exception 'Live profile photo required before responding';
  end if;

  select allow_cross_asset_responses into v_cfg from public.app_config where id = 1;
  if coalesce(v_cfg, false) then
    raise exception 'Cross-asset responses are disabled';
  end if;

  select * into v_pp_record from public.provider_profiles where user_id = v_uid;
  if not found then
    insert into public.provider_profiles (user_id, headline, kind)
    values (
      v_uid,
      nullif(trim(coalesce(p_headline, '')), ''),
      'human'
    )
    returning id into v_pp_id;
  else
    v_pp_id := v_pp_record.id;
    if v_pp_record.kind is distinct from 'human' then
      raise exception 'Only human providers may respond in V1';
    end if;
    if p_headline is not null and trim(p_headline) <> '' then
      update public.provider_profiles
      set headline = nullif(trim(p_headline), ''), updated_at = now()
      where id = v_pp_id and user_id = v_uid;
    end if;
  end if;

  if exists (
    select 1 from public.request_responses rr
    where rr.request_id = p_request_id
      and rr.provider_profile_id = v_pp_id
      and rr.status = 'pending'
  ) then
    raise exception 'You already have a pending response on this request';
  end if;

  if p_proposed_amount is null or p_proposed_amount <= 0 then
    raise exception 'Proposed amount must be positive';
  end if;
  if trunc(p_proposed_amount) <> p_proposed_amount then
    raise exception 'Proposed amount must be whole-number smallest units';
  end if;

  select decimals into v_decimals from public.assets where id = v_req.budget_asset_id;
  if v_decimals is null then
    raise exception 'Invalid request asset';
  end if;

  v_factor := 10 ^ v_decimals::int;
  if p_proposed_amount % v_factor <> 0 then
    raise exception 'Proposed amount precision must match the request asset';
  end if;

  insert into public.request_responses (
    id,
    request_id,
    provider_profile_id,
    message,
    proposed_amount,
    proposed_asset_id,
    status
  ) values (
    v_response_id,
    p_request_id,
    v_pp_id,
    nullif(trim(coalesce(p_message, '')), ''),
    p_proposed_amount,
    v_req.budget_asset_id,
    'pending'
  );

  insert into public.conversations (request_id, kind, response_id)
  values (p_request_id, 'pre_accept', v_response_id);

  insert into public.notifications (user_id, kind, title, body, request_id, response_id)
  values (
    v_req.requester_id,
    'request_new_response'::public.notification_kind,
    'New response on your request',
    'Someone submitted an offer on one of your requests.',
    p_request_id,
    v_response_id
  );

  return v_response_id;
end;
$$;

revoke all on function public.submit_request_response(uuid, text, numeric, text) from public;
grant execute on function public.submit_request_response(uuid, text, numeric, text) to authenticated;

-- Phase 8: notification category, conversation/message refs, mark-read RPCs,
-- new message + response withdrawn + engagement created events, RLS update, realtime.

-- ---------------------------------------------------------------------------
-- Product category (inbox filters; V1 only some buckets have events)
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.notification_category as enum (
    'requests_responses',
    'messages',
    'payments_wallet',
    'calls',
    'tips_reminders'
  );
exception
  when duplicate_object then null;
end $$;

alter type public.notification_kind add value if not exists 'new_message';
alter type public.notification_kind add value if not exists 'response_withdrawn';
alter type public.notification_kind add value if not exists 'engagement_created';

alter table public.notifications
  add column if not exists category public.notification_category;

alter table public.notifications
  add column if not exists conversation_id uuid references public.conversations (id) on delete set null;

alter table public.notifications
  add column if not exists message_id uuid references public.messages (id) on delete set null;

-- Backfill category from kind (idempotent)
update public.notifications n
set category = case n.kind::text
  when 'request_new_response' then 'requests_responses'::public.notification_category
  when 'response_accepted' then 'requests_responses'::public.notification_category
  when 'response_rejected' then 'requests_responses'::public.notification_category
  when 'response_withdrawn' then 'requests_responses'::public.notification_category
  when 'engagement_created' then 'requests_responses'::public.notification_category
  when 'new_message' then 'messages'::public.notification_category
  when 'delivery_submitted' then 'requests_responses'::public.notification_category
  when 'delivery_revision_requested' then 'requests_responses'::public.notification_category
  when 'delivery_approved' then 'requests_responses'::public.notification_category
  when 'engagement_auto_completed' then 'requests_responses'::public.notification_category
  when 'engagement_issue_reported' then 'tips_reminders'::public.notification_category
  when 'engagement_issue_resolved' then 'tips_reminders'::public.notification_category
  when 'review_received' then 'tips_reminders'::public.notification_category
  else 'tips_reminders'::public.notification_category
end
where n.category is null;

alter table public.notifications
  alter column category set not null;

create or replace function public.notification_category_for_kind(p_kind public.notification_kind)
returns public.notification_category
language sql
immutable
as $$
  select case p_kind::text
    when 'request_new_response' then 'requests_responses'::public.notification_category
    when 'response_accepted' then 'requests_responses'::public.notification_category
    when 'response_rejected' then 'requests_responses'::public.notification_category
    when 'response_withdrawn' then 'requests_responses'::public.notification_category
    when 'engagement_created' then 'requests_responses'::public.notification_category
    when 'new_message' then 'messages'::public.notification_category
    when 'delivery_submitted' then 'requests_responses'::public.notification_category
    when 'delivery_revision_requested' then 'requests_responses'::public.notification_category
    when 'delivery_approved' then 'requests_responses'::public.notification_category
    when 'engagement_auto_completed' then 'requests_responses'::public.notification_category
    when 'engagement_issue_reported' then 'tips_reminders'::public.notification_category
    when 'engagement_issue_resolved' then 'tips_reminders'::public.notification_category
    when 'review_received' then 'tips_reminders'::public.notification_category
    else 'tips_reminders'::public.notification_category
  end;
$$;

create or replace function public.notifications_set_category()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.category is null then
    new.category := public.notification_category_for_kind(new.kind);
  end if;
  return new;
end;
$$;

drop trigger if exists notifications_set_category_trg on public.notifications;
create trigger notifications_set_category_trg
  before insert on public.notifications
  for each row execute function public.notifications_set_category();

create index if not exists notifications_user_category_created
  on public.notifications (user_id, category, created_at desc);

create index if not exists notifications_user_unread
  on public.notifications (user_id, created_at desc)
  where read_at is null;

create index if not exists notifications_conversation
  on public.notifications (conversation_id)
  where conversation_id is not null;

-- ---------------------------------------------------------------------------
-- Mark read RPCs (SECURITY DEFINER)
-- ---------------------------------------------------------------------------
create or replace function public.mark_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  update public.notifications
  set read_at = now()
  where id = p_notification_id
    and user_id = v_uid
    and read_at is null;
end;
$$;

revoke all on function public.mark_notification_read(uuid) from public;
grant execute on function public.mark_notification_read(uuid) to authenticated;

create or replace function public.mark_all_notifications_read(p_category public.notification_category default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  n int;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_category is null then
    update public.notifications
    set read_at = now()
    where user_id = v_uid and read_at is null;
  else
    update public.notifications
    set read_at = now()
    where user_id = v_uid and read_at is null and category = p_category;
  end if;
  get diagnostics n = row_count;
  return coalesce(n, 0);
end;
$$;

revoke all on function public.mark_all_notifications_read(public.notification_category) from public;
grant execute on function public.mark_all_notifications_read(public.notification_category) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: allow recipient to update own row (read_at only — enforced by trigger)
-- ---------------------------------------------------------------------------
drop policy if exists "notifications_no_update" on public.notifications;

create or replace function public.notifications_enforce_read_only_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.user_id is distinct from old.user_id
    or new.kind is distinct from old.kind
    or new.title is distinct from old.title
    or new.body is distinct from old.body
    or new.category is distinct from old.category
    or new.request_id is distinct from old.request_id
    or new.response_id is distinct from old.response_id
    or new.engagement_id is distinct from old.engagement_id
    or new.conversation_id is distinct from old.conversation_id
    or new.message_id is distinct from old.message_id
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Only read_at may be updated';
  end if;
  if old.read_at is not null and new.read_at is distinct from old.read_at then
    raise exception 'Notification already read';
  end if;
  return new;
end;
$$;

drop trigger if exists notifications_read_only_update on public.notifications;
create trigger notifications_read_only_update
  before update on public.notifications
  for each row execute function public.notifications_enforce_read_only_update();

create policy "notifications_update_read_at_own"
  on public.notifications for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant update on public.notifications to authenticated;

-- ---------------------------------------------------------------------------
-- send_message: notify peer (dedupe: one row per message)
-- ---------------------------------------------------------------------------
create or replace function public.send_message(
  p_conversation_id uuid,
  p_kind public.message_kind,
  p_body text default null,
  p_location_lat double precision default null,
  p_location_lng double precision default null,
  p_location_label text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid := gen_random_uuid();
  v_peer uuid;
  v_req_id uuid;
  v_eng_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_conversation_participant(p_conversation_id, v_uid) then
    raise exception 'Not a participant in this conversation';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_uid
      and p.live_profile_photo_path is not null
      and p.live_profile_photo_captured_at is not null
  ) then
    raise exception 'Live profile photo required before messaging';
  end if;

  select c.request_id, c.engagement_id
  into v_req_id, v_eng_id
  from public.conversations c
  where c.id = p_conversation_id;

  select case
    when c.kind = 'pre_accept'::public.conversation_kind then
      case
        when r.requester_id = v_uid then pp.user_id
        else r.requester_id
      end
    when c.kind = 'engagement'::public.conversation_kind then
      case
        when a.requester_id = v_uid then a.provider_user_id
        else a.requester_id
      end
    else null
  end into v_peer
  from public.conversations c
  join public.requests r on r.id = c.request_id
  left join public.request_responses rr on rr.id = c.response_id
  left join public.provider_profiles pp on pp.id = rr.provider_profile_id
  left join public.engagements e on e.id = c.engagement_id
  left join public.assignments a on a.id = e.assignment_id
  where c.id = p_conversation_id;

  if v_peer is null then
    raise exception 'Could not resolve conversation peer';
  end if;

  if p_kind = 'text' then
    if p_body is null or trim(p_body) = '' then
      raise exception 'Message body required';
    end if;
    if char_length(p_body) > 8000 then
      raise exception 'Message too long';
    end if;
    insert into public.messages (id, conversation_id, sender_id, kind, body)
    values (v_id, p_conversation_id, v_uid, 'text', p_body);
  elsif p_kind = 'location' then
    if p_location_lat is null or p_location_lng is null then
      raise exception 'Location coordinates required';
    end if;
    if p_location_lat < -90 or p_location_lat > 90 or p_location_lng < -180 or p_location_lng > 180 then
      raise exception 'Invalid coordinates';
    end if;
    insert into public.messages (
      id, conversation_id, sender_id, kind, body,
      location_lat, location_lng, location_label
    )
    values (
      v_id,
      p_conversation_id,
      v_uid,
      'location',
      coalesce(nullif(trim(coalesce(p_location_label, '')), ''), 'Shared location'),
      p_location_lat,
      p_location_lng,
      nullif(trim(coalesce(p_location_label, '')), '')
    );
  else
    raise exception 'Unsupported message kind';
  end if;

  insert into public.notifications (
    user_id,
    kind,
    title,
    body,
    request_id,
    engagement_id,
    conversation_id,
    message_id
  )
  values (
    v_peer,
    'new_message'::public.notification_kind,
    'New message',
    case p_kind
      when 'text'::public.message_kind then left(trim(p_body), 200)
      else 'Location shared'
    end,
    v_req_id,
    v_eng_id,
    p_conversation_id,
    v_id
  );

  return v_id;
end;
$$;

revoke all on function public.send_message(uuid, public.message_kind, text, double precision, double precision, text) from public;
grant execute on function public.send_message(uuid, public.message_kind, text, double precision, double precision, text) to authenticated;

-- ---------------------------------------------------------------------------
-- withdraw_request_response: notify requester
-- ---------------------------------------------------------------------------
create or replace function public.withdraw_request_response(p_response_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rowcount int;
  v_req_id uuid;
  v_requester uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select rr.request_id, r.requester_id
  into v_req_id, v_requester
  from public.request_responses rr
  join public.requests r on r.id = rr.request_id
  join public.provider_profiles pp on pp.id = rr.provider_profile_id
  where rr.id = p_response_id
    and pp.user_id = v_uid
    and rr.status = 'pending';

  if v_req_id is null then
    raise exception 'Cannot withdraw this response';
  end if;

  update public.request_responses rr
  set status = 'withdrawn', updated_at = now()
  from public.provider_profiles pp
  where rr.id = p_response_id
    and rr.provider_profile_id = pp.id
    and pp.user_id = v_uid
    and rr.status = 'pending';

  get diagnostics v_rowcount = row_count;
  if v_rowcount = 0 then
    raise exception 'Cannot withdraw this response';
  end if;

  insert into public.notifications (
    user_id,
    kind,
    title,
    body,
    request_id,
    response_id
  )
  values (
    v_requester,
    'response_withdrawn'::public.notification_kind,
    'Response withdrawn',
    'A provider withdrew their offer on your request.',
    v_req_id,
    p_response_id
  );
end;
$$;

revoke all on function public.withdraw_request_response(uuid) from public;
grant execute on function public.withdraw_request_response(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- accept_response: notify requester — engagement created (skip idempotent early return)
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

  select array_agg(rr.id) into v_rej_ids
  from public.request_responses rr
  where rr.request_id = p_request_id
    and rr.status = 'pending'
    and rr.id <> p_response_id;

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
    v_req.requester_id,
    'engagement_created'::public.notification_kind,
    'Engagement started',
    'You matched with a provider. Open the engagement to coordinate.',
    p_request_id,
    p_response_id,
    v_engagement_id
  );

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
-- Phase 7 inserts already fire category trigger; ensure Realtime
-- ---------------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then null;
end $$;

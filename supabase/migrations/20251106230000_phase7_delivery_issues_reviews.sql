-- Phase 7: deliveries, delivery attachments, engagement issues, reviews,
-- auto-complete job, RPCs, RLS, storage bucket delivery-attachments.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.delivery_status as enum ('pending_review', 'revision_requested', 'approved');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.issue_status as enum ('open', 'resolved');
exception
  when duplicate_object then null;
end $$;

alter type public.notification_kind add value if not exists 'delivery_submitted';
alter type public.notification_kind add value if not exists 'delivery_revision_requested';
alter type public.notification_kind add value if not exists 'delivery_approved';
alter type public.notification_kind add value if not exists 'engagement_auto_completed';
alter type public.notification_kind add value if not exists 'engagement_issue_reported';
alter type public.notification_kind add value if not exists 'engagement_issue_resolved';
alter type public.notification_kind add value if not exists 'review_received';

-- ---------------------------------------------------------------------------
-- deliveries (one row per engagement)
-- ---------------------------------------------------------------------------
create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null unique references public.engagements (id) on delete cascade,
  provider_user_id uuid not null references public.profiles (id) on delete cascade,
  status public.delivery_status not null default 'pending_review',
  description text not null,
  submitted_at timestamptz,
  revision_requested_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deliveries_description_len check (
    char_length(trim(description)) >= 1 and char_length(description) <= 4000
  ),
  constraint deliveries_pending_has_submitted check (
    status <> 'pending_review' or submitted_at is not null
  )
);

create index if not exists deliveries_engagement on public.deliveries (engagement_id);
create index if not exists deliveries_status on public.deliveries (status);

create trigger deliveries_set_updated_at
  before update on public.deliveries
  for each row execute function public.set_profiles_updated_at();

-- ---------------------------------------------------------------------------
-- delivery_attachments (photo/video proof)
-- ---------------------------------------------------------------------------
create table public.delivery_attachments (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries (id) on delete cascade,
  storage_path text not null,
  mime_type text not null,
  byte_size bigint not null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  constraint delivery_attachments_byte_size check (byte_size > 0 and byte_size <= 26214400),
  constraint delivery_attachments_mime_allowed check (
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

create index if not exists delivery_attachments_delivery on public.delivery_attachments (delivery_id);

create or replace function public.enforce_delivery_attachment_max_ten()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  cnt int;
begin
  select count(*) into cnt
  from public.delivery_attachments
  where delivery_id = new.delivery_id;
  if cnt >= 10 then
    raise exception 'A delivery can have at most 10 attachments';
  end if;
  return new;
end;
$$;

drop trigger if exists delivery_attachments_max_ten on public.delivery_attachments;
create trigger delivery_attachments_max_ten
  before insert on public.delivery_attachments
  for each row execute function public.enforce_delivery_attachment_max_ten();

-- ---------------------------------------------------------------------------
-- engagement_issues
-- ---------------------------------------------------------------------------
create table public.engagement_issues (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  category text not null,
  body text not null,
  status public.issue_status not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint engagement_issues_body_len check (char_length(body) between 1 and 2000),
  constraint engagement_issues_category check (
    category in (
      'no_show',
      'work_not_done',
      'incomplete_work',
      'delivery_disagreement',
      'other'
    )
  )
);

create index if not exists engagement_issues_engagement on public.engagement_issues (engagement_id);
create index if not exists engagement_issues_open on public.engagement_issues (engagement_id)
  where status = 'open'::public.issue_status;

-- ---------------------------------------------------------------------------
-- reviews (one per engagement)
-- ---------------------------------------------------------------------------
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements (id) on delete cascade,
  requester_id uuid not null references public.profiles (id) on delete cascade,
  provider_user_id uuid not null references public.profiles (id) on delete cascade,
  rating smallint not null,
  comment text,
  created_at timestamptz not null default now(),
  constraint reviews_rating_range check (rating between 1 and 5),
  constraint reviews_comment_len check (comment is null or char_length(comment) <= 2000),
  constraint reviews_one_per_engagement unique (engagement_id)
);

create index if not exists reviews_provider on public.reviews (provider_user_id);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_engagement_participant(p_engagement_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.engagements e
    join public.assignments a on a.id = e.assignment_id
    where e.id = p_engagement_id
      and (a.requester_id = p_user_id or a.provider_user_id = p_user_id)
  );
$$;

revoke all on function public.is_engagement_participant(uuid, uuid) from public;
grant execute on function public.is_engagement_participant(uuid, uuid) to authenticated;

create or replace function public.restore_engagement_auto_deadline_if_eligible(p_engagement_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submitted timestamptz;
  v_has_open boolean;
  v_e public.engagements%rowtype;
begin
  select * into v_e from public.engagements where id = p_engagement_id;
  if not found then
    return;
  end if;
  if v_e.status <> 'active' then
    return;
  end if;
  select exists (
    select 1 from public.engagement_issues i
    where i.engagement_id = p_engagement_id and i.status = 'open'::public.issue_status
  ) into v_has_open;
  if v_has_open then
    return;
  end if;
  select d.submitted_at into v_submitted
  from public.deliveries d
  where d.engagement_id = p_engagement_id and d.status = 'pending_review'::public.delivery_status;
  if v_submitted is null then
    return;
  end if;
  update public.engagements
  set auto_complete_deadline_at = v_submitted + interval '72 hours'
  where id = p_engagement_id
    and status = 'active';
end;
$$;

revoke all on function public.restore_engagement_auto_deadline_if_eligible(uuid) from public;

-- ---------------------------------------------------------------------------
-- Completion core (approve + 72h job). Not granted to clients.
-- ---------------------------------------------------------------------------
create or replace function public.complete_engagement_after_delivery(
  p_engagement_id uuid,
  p_auto boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eng public.engagements%rowtype;
  v_asn public.assignments%rowtype;
  v_dlv public.deliveries%rowtype;
begin
  select * into v_eng from public.engagements where id = p_engagement_id for update;
  if not found then
    return false;
  end if;
  if v_eng.status <> 'active'::public.engagement_status then
    return false;
  end if;

  select * into v_dlv from public.deliveries where engagement_id = p_engagement_id;
  if not found or v_dlv.status <> 'pending_review'::public.delivery_status then
    return false;
  end if;

  if exists (
    select 1 from public.engagement_issues i
    where i.engagement_id = p_engagement_id and i.status = 'open'::public.issue_status
  ) then
    return false;
  end if;

  if p_auto then
    if v_eng.auto_complete_deadline_at is null or v_eng.auto_complete_deadline_at > now() then
      return false;
    end if;
  end if;

  select * into v_asn from public.assignments where id = v_eng.assignment_id;

  update public.deliveries
  set
    status = 'approved'::public.delivery_status,
    approved_at = coalesce(approved_at, now())
  where id = v_dlv.id;

  if p_auto then
    update public.engagements
    set
      status = 'completed'::public.engagement_status,
      completed_at = now(),
      auto_completed_at = now(),
      auto_complete_deadline_at = null
    where id = p_engagement_id;
  else
    update public.engagements
    set
      status = 'completed'::public.engagement_status,
      completed_at = now(),
      auto_complete_deadline_at = null,
      auto_completed_at = null
    where id = p_engagement_id;
  end if;

  update public.requests
  set status = 'completed'::public.request_status
  where id = v_asn.request_id;

  if p_auto then
    insert into public.notifications (user_id, kind, title, body, request_id, engagement_id)
    values (
      v_asn.requester_id,
      'engagement_auto_completed'::public.notification_kind,
      'Engagement completed',
      'The engagement was auto-completed after 72 hours without a response.',
      v_asn.request_id,
      p_engagement_id
    );
    insert into public.notifications (user_id, kind, title, body, request_id, engagement_id)
    values (
      v_asn.provider_user_id,
      'engagement_auto_completed'::public.notification_kind,
      'Engagement completed',
      'The engagement was auto-completed after 72 hours without a response.',
      v_asn.request_id,
      p_engagement_id
    );
  end if;

  return true;
end;
$$;

revoke all on function public.complete_engagement_after_delivery(uuid, boolean) from public;

-- ---------------------------------------------------------------------------
-- RLS: deliveries
-- ---------------------------------------------------------------------------
alter table public.deliveries enable row level security;

drop policy if exists "deliveries_select_participant" on public.deliveries;
create policy "deliveries_select_participant"
  on public.deliveries for select
  to authenticated
  using (public.is_engagement_participant(engagement_id, auth.uid()));

drop policy if exists "deliveries_no_mutate" on public.deliveries;
create policy "deliveries_no_mutate"
  on public.deliveries for all
  to authenticated
  using (false)
  with check (false);

grant select on public.deliveries to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: delivery_attachments
-- ---------------------------------------------------------------------------
alter table public.delivery_attachments enable row level security;

drop policy if exists "delivery_attachments_select" on public.delivery_attachments;
create policy "delivery_attachments_select"
  on public.delivery_attachments for select
  to authenticated
  using (
    exists (
      select 1 from public.deliveries d
      where d.id = delivery_attachments.delivery_id
        and public.is_engagement_participant(d.engagement_id, auth.uid())
    )
  );

drop policy if exists "delivery_attachments_no_insert" on public.delivery_attachments;
create policy "delivery_attachments_no_insert"
  on public.delivery_attachments for insert
  to authenticated
  with check (false);

grant select on public.delivery_attachments to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: engagement_issues
-- ---------------------------------------------------------------------------
alter table public.engagement_issues enable row level security;

drop policy if exists "engagement_issues_select" on public.engagement_issues;
create policy "engagement_issues_select"
  on public.engagement_issues for select
  to authenticated
  using (public.is_engagement_participant(engagement_id, auth.uid()));

drop policy if exists "engagement_issues_no_insert" on public.engagement_issues;
create policy "engagement_issues_no_insert"
  on public.engagement_issues for insert
  to authenticated
  with check (false);

drop policy if exists "engagement_issues_no_update" on public.engagement_issues;
create policy "engagement_issues_no_update"
  on public.engagement_issues for update
  to authenticated
  using (false);

grant select on public.engagement_issues to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: reviews
-- ---------------------------------------------------------------------------
alter table public.reviews enable row level security;

drop policy if exists "reviews_select_participant" on public.reviews;
create policy "reviews_select_participant"
  on public.reviews for select
  to authenticated
  using (
    requester_id = auth.uid()
    or provider_user_id = auth.uid()
  );

drop policy if exists "reviews_no_insert" on public.reviews;
create policy "reviews_no_insert"
  on public.reviews for insert
  to authenticated
  with check (false);

grant select on public.reviews to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: delivery-attachments — path {uid}/{engagement_id}/{delivery_id}/...
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('delivery-attachments', 'delivery-attachments', false)
on conflict (id) do nothing;

drop policy if exists "delivery_att_storage_insert" on storage.objects;
create policy "delivery_att_storage_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'delivery-attachments'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "delivery_att_storage_select" on storage.objects;
create policy "delivery_att_storage_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'delivery-attachments'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "delivery_att_storage_select_participant" on storage.objects;
create policy "delivery_att_storage_select_participant"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'delivery-attachments'
    and exists (
      select 1
      from public.delivery_attachments da
      join public.deliveries d on d.id = da.delivery_id
      where da.storage_path = name
        and public.is_engagement_participant(d.engagement_id, auth.uid())
    )
  );

drop policy if exists "delivery_att_storage_update" on storage.objects;
create policy "delivery_att_storage_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'delivery-attachments'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "delivery_att_storage_delete" on storage.objects;
create policy "delivery_att_storage_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'delivery-attachments'
    and split_part(name, '/', 1) = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- submit_delivery
-- ---------------------------------------------------------------------------
create or replace function public.submit_delivery(
  p_engagement_id uuid,
  p_description text,
  p_post_to_chat boolean default false
)
returns table (
  delivery_id uuid,
  chat_message_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_eng public.engagements%rowtype;
  v_asn public.assignments%rowtype;
  v_dlv public.deliveries;
  v_conv_id uuid;
  v_msg uuid;
  v_caption text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_description is null or trim(p_description) = '' then
    raise exception 'Description required';
  end if;
  if char_length(trim(p_description)) > 4000 then
    raise exception 'Description too long';
  end if;

  select * into v_eng from public.engagements where id = p_engagement_id for update;
  if not found then
    raise exception 'Engagement not found';
  end if;
  if v_eng.status <> 'active'::public.engagement_status then
    raise exception 'Engagement not active';
  end if;

  select * into v_asn from public.assignments where id = v_eng.assignment_id;
  if v_asn.provider_user_id is distinct from v_uid then
    raise exception 'Only the assigned provider can submit delivery';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_uid
      and p.live_profile_photo_path is not null
      and p.live_profile_photo_captured_at is not null
  ) then
    raise exception 'Live profile photo required';
  end if;

  select * into v_dlv from public.deliveries where engagement_id = p_engagement_id;

  if not found then
    insert into public.deliveries (
      engagement_id,
      provider_user_id,
      status,
      description,
      submitted_at
    )
    values (
      p_engagement_id,
      v_uid,
      'pending_review'::public.delivery_status,
      trim(p_description),
      now()
    )
    returning * into v_dlv;
  elsif v_dlv.status = 'revision_requested'::public.delivery_status then
    delete from public.delivery_attachments where delivery_id = v_dlv.id;
    update public.deliveries
    set
      description = trim(p_description),
      status = 'pending_review'::public.delivery_status,
      submitted_at = now()
    where id = v_dlv.id
    returning * into v_dlv;
  elsif v_dlv.status = 'pending_review'::public.delivery_status then
    raise exception 'Delivery already pending review';
  else
    raise exception 'Delivery already finalized';
  end if;

  update public.engagements
  set auto_complete_deadline_at = v_dlv.submitted_at + interval '72 hours'
  where id = p_engagement_id;

  insert into public.notifications (user_id, kind, title, body, request_id, engagement_id)
  values (
    v_asn.requester_id,
    'delivery_submitted'::public.notification_kind,
    'Delivery submitted',
    'The provider submitted work for your review.',
    v_asn.request_id,
    p_engagement_id
  );

  chat_message_id := null;
  if coalesce(p_post_to_chat, false) then
    select c.id into v_conv_id
    from public.conversations c
    where c.engagement_id = p_engagement_id
      and c.kind = 'engagement'::public.conversation_kind;
    if v_conv_id is null then
      raise exception 'No engagement conversation';
    end if;
    v_caption := '[Delivery] ' || left(trim(p_description), 7900);
    insert into public.messages (id, conversation_id, sender_id, kind, body)
    values (gen_random_uuid(), v_conv_id, v_uid, 'text'::public.message_kind, v_caption)
    returning id into v_msg;
    chat_message_id := v_msg;
  end if;

  delivery_id := v_dlv.id;
  return next;
end;
$$;

revoke all on function public.submit_delivery(uuid, text, boolean) from public;
grant execute on function public.submit_delivery(uuid, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- add_delivery_attachments
-- ---------------------------------------------------------------------------
create or replace function public.add_delivery_attachments(
  p_delivery_id uuid,
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
  v_eng_id uuid;
  v_provider uuid;
  v_st public.delivery_status;
  n int;
  i int;
  v_path text;
  v_mime text;
  v_size bigint;
  prefix text;
  expected_prefix text;
  existing_cnt int;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_paths is null or cardinality(p_paths) = 0 then
    raise exception 'No paths';
  end if;
  n := cardinality(p_paths);
  if cardinality(p_mime_types) <> n or cardinality(p_byte_sizes) <> n then
    raise exception 'Mismatched arrays';
  end if;
  if n > 10 then
    raise exception 'At most 10 attachments per delivery';
  end if;

  select d.engagement_id, d.provider_user_id, d.status
  into v_eng_id, v_provider, v_st
  from public.deliveries d
  where d.id = p_delivery_id;
  if not found then
    raise exception 'Delivery not found';
  end if;
  if v_provider is distinct from v_uid then
    raise exception 'Not allowed';
  end if;
  if v_st <> 'pending_review'::public.delivery_status then
    raise exception 'Delivery not accepting attachments';
  end if;

  select count(*)::int into existing_cnt
  from public.delivery_attachments where delivery_id = p_delivery_id;
  if existing_cnt + n > 10 then
    raise exception 'A delivery can have at most 10 attachments';
  end if;

  prefix := v_uid::text || '/';
  expected_prefix := v_uid::text || '/' || v_eng_id::text || '/' || p_delivery_id::text || '/';

  for i in 1..n loop
    v_path := p_paths[i];
    v_mime := p_mime_types[i];
    v_size := p_byte_sizes[i];
    if v_path is null or v_path = '' then
      raise exception 'Invalid path';
    end if;
    if position(prefix in v_path) <> 1 then
      raise exception 'Invalid storage path prefix';
    end if;
    if position(expected_prefix in v_path) <> 1 then
      raise exception 'Path must belong to this delivery';
    end if;
    if v_mime is null or v_mime not in (
      'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm'
    ) then
      raise exception 'File type not allowed';
    end if;
    if v_size is null or v_size <= 0 or v_size > 26214400 then
      raise exception 'Invalid file size (max 25 MB)';
    end if;
    insert into public.delivery_attachments (delivery_id, storage_path, mime_type, byte_size, sort_order)
    values (p_delivery_id, v_path, v_mime, v_size, (existing_cnt + i - 1)::smallint);
  end loop;
end;
$$;

revoke all on function public.add_delivery_attachments(uuid, text[], text[], bigint[]) from public;
grant execute on function public.add_delivery_attachments(uuid, text[], text[], bigint[]) to authenticated;

-- ---------------------------------------------------------------------------
-- review_delivery (requester only)
-- ---------------------------------------------------------------------------
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
    select public.complete_engagement_after_delivery(p_engagement_id, false) into v_ok;
    if not v_ok then
      raise exception 'Could not complete engagement';
    end if;

    insert into public.notifications (user_id, kind, title, body, request_id, engagement_id)
    values (
      v_asn.provider_user_id,
      'delivery_approved'::public.notification_kind,
      'Delivery approved',
      'The requester approved your delivery.',
      v_asn.request_id,
      p_engagement_id
    );
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

revoke all on function public.review_delivery(uuid, text, text) from public;
grant execute on function public.review_delivery(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- report_engagement_issue
-- ---------------------------------------------------------------------------
create or replace function public.report_engagement_issue(
  p_engagement_id uuid,
  p_category text,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_eng public.engagements%rowtype;
  v_asn public.assignments%rowtype;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_body is null or char_length(trim(p_body)) < 1 or char_length(p_body) > 2000 then
    raise exception 'Invalid description';
  end if;
  if p_category is null or p_category not in (
    'no_show', 'work_not_done', 'incomplete_work', 'delivery_disagreement', 'other'
  ) then
    raise exception 'Invalid category';
  end if;

  if not public.is_engagement_participant(p_engagement_id, v_uid) then
    raise exception 'Not allowed';
  end if;

  select * into v_eng from public.engagements where id = p_engagement_id for update;
  if not found then
    raise exception 'Engagement not found';
  end if;
  if v_eng.status <> 'active'::public.engagement_status then
    raise exception 'Engagement not active';
  end if;

  select * into v_asn from public.assignments where id = v_eng.assignment_id;

  insert into public.engagement_issues (engagement_id, reporter_id, category, body, status)
  values (p_engagement_id, v_uid, p_category, trim(p_body), 'open'::public.issue_status)
  returning id into v_id;

  update public.engagements
  set auto_complete_deadline_at = null
  where id = p_engagement_id;

  insert into public.notifications (user_id, kind, title, body, request_id, engagement_id)
  values (
    case when v_uid = v_asn.requester_id then v_asn.provider_user_id else v_asn.requester_id end,
    'engagement_issue_reported'::public.notification_kind,
    'Issue reported',
    left(trim(p_body), 200),
    v_asn.request_id,
    p_engagement_id
  );

  return v_id;
end;
$$;

revoke all on function public.report_engagement_issue(uuid, text, text) from public;
grant execute on function public.report_engagement_issue(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- resolve_engagement_issue (either participant)
-- ---------------------------------------------------------------------------
create or replace function public.resolve_engagement_issue(p_issue_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.engagement_issues%rowtype;
  v_asn public.assignments%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_row from public.engagement_issues where id = p_issue_id for update;
  if not found then
    raise exception 'Issue not found';
  end if;
  if v_row.status <> 'open'::public.issue_status then
    return;
  end if;

  if not public.is_engagement_participant(v_row.engagement_id, v_uid) then
    raise exception 'Not allowed';
  end if;

  update public.engagement_issues
  set status = 'resolved'::public.issue_status, resolved_at = now()
  where id = p_issue_id;

  select * into v_asn
  from public.assignments a
  join public.engagements e on e.assignment_id = a.id
  where e.id = v_row.engagement_id;

  insert into public.notifications (user_id, kind, title, body, request_id, engagement_id)
  values (
    case when v_uid = v_asn.requester_id then v_asn.provider_user_id else v_asn.requester_id end,
    'engagement_issue_resolved'::public.notification_kind,
    'Issue resolved',
    'An issue on your engagement was marked resolved.',
    v_asn.request_id,
    v_row.engagement_id
  );

  perform public.restore_engagement_auto_deadline_if_eligible(v_row.engagement_id);
end;
$$;

revoke all on function public.resolve_engagement_issue(uuid) from public;
grant execute on function public.resolve_engagement_issue(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- submit_review (requester, after completed)
-- ---------------------------------------------------------------------------
create or replace function public.submit_review(
  p_engagement_id uuid,
  p_rating smallint,
  p_comment text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_eng public.engagements%rowtype;
  v_asn public.assignments%rowtype;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Invalid rating';
  end if;
  if p_comment is not null and char_length(p_comment) > 2000 then
    raise exception 'Comment too long';
  end if;

  select * into v_eng from public.engagements where id = p_engagement_id for update;
  if not found then
    raise exception 'Engagement not found';
  end if;
  if v_eng.status <> 'completed'::public.engagement_status then
    raise exception 'Engagement not completed';
  end if;

  select * into v_asn from public.assignments where id = v_eng.assignment_id;
  if v_asn.requester_id is distinct from v_uid then
    raise exception 'Only the requester can submit a review';
  end if;

  insert into public.reviews (engagement_id, requester_id, provider_user_id, rating, comment)
  values (
    p_engagement_id,
    v_uid,
    v_asn.provider_user_id,
    p_rating,
    nullif(trim(coalesce(p_comment, '')), '')
  )
  on conflict (engagement_id) do nothing
  returning id into v_id;

  if v_id is null then
    raise exception 'Review already exists';
  end if;

  insert into public.notifications (user_id, kind, title, body, request_id, engagement_id)
  values (
    v_asn.provider_user_id,
    'review_received'::public.notification_kind,
    'New review',
    format('You received a %s-star review.', p_rating::text),
    v_asn.request_id,
    p_engagement_id
  );

  return v_id;
end;
$$;

revoke all on function public.submit_review(uuid, smallint, text) from public;
grant execute on function public.submit_review(uuid, smallint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- auto_complete_engagements — idempotent batch (for pg_cron / scheduler)
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
begin
  for r in
    select e.id
    from public.engagements e
    where e.status = 'active'::public.engagement_status
      and e.auto_complete_deadline_at is not null
      and e.auto_complete_deadline_at <= now()
  loop
    select public.complete_engagement_after_delivery(r.id, true) into v_ok;
    if v_ok then
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

revoke all on function public.auto_complete_engagements() from public;
-- Invoke from Supabase cron / Dashboard as postgres, or grant to service_role only:
grant execute on function public.auto_complete_engagements() to service_role;

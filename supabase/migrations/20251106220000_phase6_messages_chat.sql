-- Phase 6: messages, attachments, read state, conversation attachments storage,
-- participant-only RLS, RPCs, Realtime publication.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.message_kind as enum ('text', 'location');
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Optional private contact (phone) — not visible to all authenticated users
-- ---------------------------------------------------------------------------
create table public.profile_private_contact (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  phone text,
  updated_at timestamptz not null default now(),
  constraint profile_private_contact_phone_len check (
    phone is null or (char_length(trim(phone)) >= 8 and char_length(phone) <= 32)
  )
);

create trigger profile_private_contact_set_updated_at
  before update on public.profile_private_contact
  for each row execute function public.set_profiles_updated_at();

alter table public.profile_private_contact enable row level security;

drop policy if exists "profile_private_contact_own" on public.profile_private_contact;
create policy "profile_private_contact_own"
  on public.profile_private_contact for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Allow read when co-participant in a conversation (pre_accept or engagement)
create or replace function public.can_read_private_contact(p_target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and (
      auth.uid() = p_target_user
      or exists (
        select 1 from public.conversations c
        join public.requests r on r.id = c.request_id
        where c.kind = 'pre_accept'
          and c.response_id is not null
          and (
            r.requester_id = auth.uid()
            or exists (
              select 1 from public.request_responses rr
              join public.provider_profiles pp on pp.id = rr.provider_profile_id
              where rr.id = c.response_id
                and pp.user_id = auth.uid()
            )
          )
          and (
            r.requester_id = p_target_user
            or exists (
              select 1 from public.request_responses rr2
              join public.provider_profiles pp2 on pp2.id = rr2.provider_profile_id
              where rr2.id = c.response_id
                and pp2.user_id = p_target_user
            )
          )
      )
      or exists (
        select 1 from public.assignments a
        join public.engagements e on e.assignment_id = a.id
        join public.conversations c on c.engagement_id = e.id and c.kind = 'engagement'
        where (a.requester_id = auth.uid() and a.provider_user_id = p_target_user)
           or (a.provider_user_id = auth.uid() and a.requester_id = p_target_user)
      )
    );
$$;

revoke all on function public.can_read_private_contact(uuid) from public;
grant execute on function public.can_read_private_contact(uuid) to authenticated;

drop policy if exists "profile_private_contact_partner_read" on public.profile_private_contact;
create policy "profile_private_contact_partner_read"
  on public.profile_private_contact for select
  to authenticated
  using (public.can_read_private_contact(user_id));

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  kind public.message_kind not null default 'text',
  body text,
  location_lat double precision,
  location_lng double precision,
  location_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint messages_body_len check (body is null or char_length(body) <= 8000),
  constraint messages_location_label_len check (
    location_label is null or char_length(location_label) <= 500
  ),
  constraint messages_kind_text check (
    kind <> 'text' or (body is not null and trim(body) <> '')
  ),
  constraint messages_kind_location check (
    kind <> 'location'
    or (
      location_lat is not null
      and location_lng is not null
      and location_lat between -90 and 90
      and location_lng between -180 and 180
    )
  )
);

create index if not exists messages_conversation_created
  on public.messages (conversation_id, created_at);

create trigger messages_set_updated_at
  before update on public.messages
  for each row execute function public.set_profiles_updated_at();

-- ---------------------------------------------------------------------------
-- message_attachments
-- ---------------------------------------------------------------------------
create table public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  storage_path text not null,
  mime_type text not null,
  byte_size bigint not null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  constraint message_attachments_byte_size check (byte_size > 0 and byte_size <= 26214400),
  constraint message_attachments_mime_allowed check (
    mime_type in (
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'video/mp4', 'video/webm',
      'application/pdf',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
  )
);

create index if not exists message_attachments_message on public.message_attachments (message_id);

create or replace function public.enforce_message_attachment_max_ten()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  cnt int;
begin
  select count(*) into cnt from public.message_attachments where message_id = new.message_id;
  if cnt >= 10 then
    raise exception 'A message can have at most 10 attachments';
  end if;
  return new;
end;
$$;

drop trigger if exists message_attachments_max_ten on public.message_attachments;
create trigger message_attachments_max_ten
  before insert on public.message_attachments
  for each row execute function public.enforce_message_attachment_max_ten();

-- ---------------------------------------------------------------------------
-- message_reads (read receipts)
-- ---------------------------------------------------------------------------
create table public.message_reads (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index if not exists message_reads_user on public.message_reads (user_id);

-- ---------------------------------------------------------------------------
-- Participant helpers (SECURITY DEFINER)
-- ---------------------------------------------------------------------------
create or replace function public.is_conversation_participant(p_conversation_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.conversations c
      join public.requests r on r.id = c.request_id
      where c.id = p_conversation_id
        and c.kind = 'pre_accept'
        and c.response_id is not null
        and (
          r.requester_id = p_user_id
          or exists (
            select 1 from public.request_responses rr
            join public.provider_profiles pp on pp.id = rr.provider_profile_id
            where rr.id = c.response_id
              and pp.user_id = p_user_id
          )
        )
    )
    or exists (
      select 1 from public.conversations c
      join public.engagements e on e.id = c.engagement_id
      join public.assignments a on a.id = e.assignment_id
      where c.id = p_conversation_id
        and c.kind = 'engagement'
        and (a.requester_id = p_user_id or a.provider_user_id = p_user_id)
    );
$$;

revoke all on function public.is_conversation_participant(uuid, uuid) from public;
grant execute on function public.is_conversation_participant(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS messages
-- ---------------------------------------------------------------------------
alter table public.messages enable row level security;

drop policy if exists "messages_select_participant" on public.messages;
create policy "messages_select_participant"
  on public.messages for select
  to authenticated
  using (public.is_conversation_participant(conversation_id, auth.uid()));

drop policy if exists "messages_no_direct_write" on public.messages;
create policy "messages_no_direct_insert"
  on public.messages for insert
  to authenticated
  with check (false);

drop policy if exists "messages_no_direct_update" on public.messages;
create policy "messages_no_direct_update"
  on public.messages for update
  to authenticated
  using (false)
  with check (false);

drop policy if exists "messages_no_direct_delete" on public.messages;
create policy "messages_no_direct_delete"
  on public.messages for delete
  to authenticated
  using (false);

-- ---------------------------------------------------------------------------
-- RLS message_attachments
-- ---------------------------------------------------------------------------
alter table public.message_attachments enable row level security;

drop policy if exists "message_attachments_select" on public.message_attachments;
create policy "message_attachments_select"
  on public.message_attachments for select
  to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_attachments.message_id
        and public.is_conversation_participant(m.conversation_id, auth.uid())
    )
  );

drop policy if exists "message_attachments_no_write" on public.message_attachments;
create policy "message_attachments_no_insert"
  on public.message_attachments for insert
  to authenticated
  with check (false);

grant select on public.message_attachments to authenticated;

-- ---------------------------------------------------------------------------
-- RLS message_reads
-- ---------------------------------------------------------------------------
alter table public.message_reads enable row level security;

drop policy if exists "message_reads_select" on public.message_reads;
create policy "message_reads_select"
  on public.message_reads for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.messages m
      where m.id = message_reads.message_id
        and public.is_conversation_participant(m.conversation_id, auth.uid())
    )
  );

drop policy if exists "message_reads_no_direct" on public.message_reads;
create policy "message_reads_no_insert"
  on public.message_reads for insert
  to authenticated
  with check (false);

-- ---------------------------------------------------------------------------
-- Storage: conversation-attachments
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('conversation-attachments', 'conversation-attachments', false)
on conflict (id) do nothing;

drop policy if exists "conv_att_storage_insert" on storage.objects;
create policy "conv_att_storage_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'conversation-attachments'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "conv_att_storage_select" on storage.objects;
create policy "conv_att_storage_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'conversation-attachments'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "conv_att_storage_select_participant" on storage.objects;
create policy "conv_att_storage_select_participant"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'conversation-attachments'
    and exists (
      select 1
      from public.message_attachments ma
      join public.messages m on m.id = ma.message_id
      where ma.storage_path = name
        and public.is_conversation_participant(m.conversation_id, auth.uid())
    )
  );

drop policy if exists "conv_att_storage_update" on storage.objects;
create policy "conv_att_storage_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'conversation-attachments'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "conv_att_storage_delete" on storage.objects;
create policy "conv_att_storage_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'conversation-attachments'
    and split_part(name, '/', 1) = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- send_message
-- ---------------------------------------------------------------------------
create or replace function public.send_message(
  p_conversation_id uuid,
  p_kind public.message_kind,
  p_body text,
  p_location_lat double precision,
  p_location_lng double precision,
  p_location_label text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid := gen_random_uuid();
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

  return v_id;
end;
$$;

revoke all on function public.send_message(uuid, public.message_kind, text, double precision, double precision, text) from public;
grant execute on function public.send_message(uuid, public.message_kind, text, double precision, double precision, text) to authenticated;

-- ---------------------------------------------------------------------------
-- add_message_attachments (after client upload under uid prefix)
-- Path format: {uid}/{conversation_id}/{message_id}/{filename}
-- ---------------------------------------------------------------------------
create or replace function public.add_message_attachments(
  p_message_id uuid,
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
  v_conv uuid;
  v_sender uuid;
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
    raise exception 'At most 10 attachments per message';
  end if;

  select m.conversation_id, m.sender_id into v_conv, v_sender
  from public.messages m
  where m.id = p_message_id;
  if not found then
    raise exception 'Message not found';
  end if;

  if v_sender is distinct from v_uid then
    raise exception 'Not allowed';
  end if;

  if not public.is_conversation_participant(v_conv, v_uid) then
    raise exception 'Not a participant in this conversation';
  end if;

  select count(*)::int into existing_cnt
  from public.message_attachments where message_id = p_message_id;
  if existing_cnt + n > 10 then
    raise exception 'A message can have at most 10 attachments';
  end if;

  prefix := v_uid::text || '/';
  expected_prefix := v_uid::text || '/' || v_conv::text || '/' || p_message_id::text || '/';

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
      raise exception 'Path must belong to this conversation and message';
    end if;

    if v_mime is null or v_mime not in (
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'video/mp4', 'video/webm',
      'application/pdf',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) then
      raise exception 'File type not allowed';
    end if;

    if v_size is null or v_size <= 0 or v_size > 26214400 then
      raise exception 'Invalid file size (max 25 MB)';
    end if;

    insert into public.message_attachments (message_id, storage_path, mime_type, byte_size, sort_order)
    values (p_message_id, v_path, v_mime, v_size, (existing_cnt + i - 1)::smallint);
  end loop;
end;
$$;

revoke all on function public.add_message_attachments(uuid, text[], text[], bigint[]) from public;
grant execute on function public.add_message_attachments(uuid, text[], text[], bigint[]) to authenticated;

-- ---------------------------------------------------------------------------
-- mark_conversation_read — read receipts for messages from others
-- ---------------------------------------------------------------------------
create or replace function public.mark_conversation_read(p_conversation_id uuid)
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

  if not public.is_conversation_participant(p_conversation_id, v_uid) then
    raise exception 'Not a participant in this conversation';
  end if;

  insert into public.message_reads (message_id, user_id, read_at)
  select m.id, v_uid, now()
  from public.messages m
  where m.conversation_id = p_conversation_id
    and m.sender_id is distinct from v_uid
  on conflict (message_id, user_id) do update set read_at = excluded.read_at;
end;
$$;

revoke all on function public.mark_conversation_read(uuid) from public;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

grant select on public.messages to authenticated;

-- mark_conversation_read runs as SECURITY DEFINER (bypasses RLS for message_reads INSERT)

-- ---------------------------------------------------------------------------
-- Realtime: replicate message changes to subscribed clients
-- ---------------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.message_reads;
exception
  when duplicate_object then null;
end $$;

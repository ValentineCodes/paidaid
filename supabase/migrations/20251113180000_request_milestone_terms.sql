-- Request-level milestone terms (pre-funding agreement). Additive; single payment unchanged.

do $$ begin
  create type public.milestone_offer_status as enum (
    'not_applicable',
    'pending_provider',
    'accepted_as_proposed',
    'proposal_pending',
    'agreed',
    'proposal_rejected'
  );
exception
  when duplicate_object then null;
end $$;

alter table public.requests
  add column if not exists payment_mode public.engagement_payment_mode
    not null default 'single'::public.engagement_payment_mode;

alter table public.request_responses
  add column if not exists milestone_offer_status public.milestone_offer_status
    not null default 'not_applicable'::public.milestone_offer_status;

create table if not exists public.request_milestones (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  position smallint not null,
  title text not null,
  description text not null default '',
  amount numeric(78, 0) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint request_milestones_position_range check (position between 1 and 5),
  constraint request_milestones_amount_positive check (amount > 0),
  constraint request_milestones_title_len check (
    char_length(trim(title)) between 1 and 200
  ),
  constraint request_milestones_description_len check (char_length(description) <= 4000)
);

create unique index if not exists request_milestones_request_position_uniq
  on public.request_milestones (request_id, position);

create index if not exists request_milestones_request_idx
  on public.request_milestones (request_id, position);

create trigger request_milestones_set_updated_at
  before update on public.request_milestones
  for each row execute function public.set_profiles_updated_at();

create table if not exists public.request_response_milestone_proposals (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null
    references public.request_responses (id) on delete cascade,
  position smallint not null,
  title text not null,
  description text not null default '',
  amount numeric(78, 0) not null,
  created_at timestamptz not null default now(),
  constraint request_response_milestone_proposals_position_range check (
    position between 1 and 5
  ),
  constraint request_response_milestone_proposals_amount_positive check (amount > 0),
  constraint request_response_milestone_proposals_title_len check (
    char_length(trim(title)) between 1 and 200
  )
);

create unique index if not exists request_response_milestone_proposals_response_position
  on public.request_response_milestone_proposals (response_id, position);

alter table public.request_milestones enable row level security;
alter table public.request_response_milestone_proposals enable row level security;

drop policy if exists request_response_milestone_proposals_select_participant
  on public.request_response_milestone_proposals;
create policy request_response_milestone_proposals_select_participant
  on public.request_response_milestone_proposals for select
  to authenticated
  using (
    exists (
      select 1
      from public.request_responses rr
      join public.requests r on r.id = rr.request_id
      where rr.id = request_response_milestone_proposals.response_id
        and r.requester_id = auth.uid()
    )
    or exists (
      select 1
      from public.request_responses rr
      join public.provider_profiles pp on pp.id = rr.provider_profile_id
      where rr.id = request_response_milestone_proposals.response_id
        and pp.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Shared milestone JSON validation (create / proposal)
-- ---------------------------------------------------------------------------
create or replace function public.validate_milestone_schedule_json(
  p_milestones jsonb,
  p_expected_total numeric
)
returns void
language plpgsql
immutable
as $$
declare
  v_cnt int;
  v_sum numeric(78, 0) := 0;
  v_elem jsonb;
  v_pos int;
  v_positions int[] := '{}';
  v_amount numeric(78, 0);
begin
  if p_milestones is null or jsonb_typeof(p_milestones) <> 'array' then
    raise exception 'milestones must be a json array';
  end if;
  v_cnt := jsonb_array_length(p_milestones);
  if v_cnt < 2 or v_cnt > 5 then
    raise exception 'milestones count must be between 2 and 5';
  end if;

  for v_elem in select value from jsonb_array_elements(p_milestones) loop
    v_pos := (v_elem ->> 'position')::int;
    if v_pos is null or v_pos < 1 or v_pos > 5 then
      raise exception 'invalid milestone position';
    end if;
    if v_pos = any (v_positions) then
      raise exception 'duplicate milestone position';
    end if;
    v_positions := array_append(v_positions, v_pos);

    if trim(coalesce(v_elem ->> 'title', '')) = ''
       or char_length(trim(v_elem ->> 'title')) > 200 then
      raise exception 'invalid milestone title';
    end if;
    if char_length(coalesce(v_elem ->> 'description', '')) > 4000 then
      raise exception 'milestone description too long';
    end if;

    begin
      v_amount := (v_elem ->> 'amount')::numeric(78, 0);
    exception
      when others then
        raise exception 'milestone amount must be an integer string';
    end;
    if v_amount is null or v_amount <= 0 or trunc(v_amount) <> v_amount then
      raise exception 'milestone amount must be a positive integer';
    end if;
    v_sum := v_sum + v_amount;
  end loop;

  for v_pos in 1 .. v_cnt loop
    if not (v_pos = any (v_positions)) then
      raise exception 'milestone positions must be contiguous from 1';
    end if;
  end loop;

  if v_sum <> p_expected_total then
    raise exception 'milestone amounts must sum to budget';
  end if;
end;
$$;

drop function if exists public.create_request(
  text, text, public.timing_type, timestamptz, timestamptz, timestamptz,
  numeric, uuid, public.location_kind, text, jsonb, uuid[], boolean
);

drop function if exists public.submit_request_response(uuid, text, numeric, text);

-- ---------------------------------------------------------------------------
-- create_request — optional milestones
-- ---------------------------------------------------------------------------
create or replace function public.create_request(
  p_title text,
  p_description text,
  p_timing_type public.timing_type,
  p_scheduled_at timestamptz,
  p_deadline_at timestamptz,
  p_expires_at timestamptz,
  p_budget_amount numeric,
  p_budget_asset_id uuid,
  p_location_kind public.location_kind,
  p_location_label text,
  p_location_structured jsonb,
  p_tag_ids uuid[],
  p_publish boolean,
  p_payment_mode public.engagement_payment_mode default 'single'::public.engagement_payment_mode,
  p_milestones jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_req_id uuid := gen_random_uuid();
  v_status public.request_status;
  v_tag uuid;
  v_tag_count int;
  v_tag_ids uuid[];
  v_requester_near text;
  v_elem jsonb;
  v_pos smallint;
  v_amount numeric(78, 0);
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  v_requester_near := public.require_auth_linked_near_account();

  if p_budget_amount is null or p_budget_amount <= 0 then
    raise exception 'Budget must be a positive amount';
  end if;
  if trunc(p_budget_amount) <> p_budget_amount then
    raise exception 'Budget must be a whole number of smallest units';
  end if;

  if p_payment_mode = 'milestones'::public.engagement_payment_mode then
    perform public.validate_milestone_schedule_json(p_milestones, p_budget_amount);
  elsif p_milestones is not null then
    raise exception 'milestones not allowed for single payment';
  end if;

  if p_tag_ids is not null and cardinality(p_tag_ids) > 0 then
    select coalesce(array_agg(distinct x), '{}')
    into v_tag_ids
    from unnest(p_tag_ids) as t(x);
    v_tag_count := cardinality(v_tag_ids);
    if v_tag_count > 3 then
      raise exception 'At most 3 tags';
    end if;
    foreach v_tag in array v_tag_ids loop
      if not exists (select 1 from public.tags tag where tag.id = v_tag) then
        raise exception 'Invalid tag id';
      end if;
    end loop;
  else
    v_tag_ids := null;
  end if;

  if not exists (select 1 from public.assets a where a.id = p_budget_asset_id) then
    raise exception 'Invalid asset';
  end if;

  if p_publish then
    v_status := 'open';
  else
    v_status := 'draft';
  end if;

  insert into public.requests (
    id, requester_id, requester_near_account_id, title, description, status,
    timing_type, scheduled_at, deadline_at, expires_at, budget_amount,
    budget_asset_id, location_kind, location_label, location_structured,
    published_at, payment_mode
  ) values (
    v_req_id, v_uid, v_requester_near, trim(p_title), trim(p_description), v_status,
    p_timing_type, p_scheduled_at, p_deadline_at, p_expires_at, p_budget_amount,
    p_budget_asset_id, coalesce(p_location_kind, 'unspecified'),
    nullif(trim(coalesce(p_location_label, '')), ''),
    p_location_structured,
    case when p_publish then now() else null end,
    coalesce(p_payment_mode, 'single'::public.engagement_payment_mode)
  );

  if v_tag_ids is not null then
    foreach v_tag in array v_tag_ids loop
      insert into public.request_tags (request_id, tag_id) values (v_req_id, v_tag);
    end loop;
  end if;

  if p_payment_mode = 'milestones'::public.engagement_payment_mode then
    for v_elem in
      select value from jsonb_array_elements(p_milestones) order by (value ->> 'position')::int
    loop
      v_pos := (v_elem ->> 'position')::smallint;
      v_amount := (v_elem ->> 'amount')::numeric(78, 0);
      insert into public.request_milestones (
        request_id, position, title, description, amount
      ) values (
        v_req_id,
        v_pos,
        trim(v_elem ->> 'title'),
        coalesce(v_elem ->> 'description', ''),
        v_amount
      );
    end loop;
  end if;

  return v_req_id;
end;
$$;

revoke all on function public.create_request(
  text, text, public.timing_type, timestamptz, timestamptz, timestamptz,
  numeric, uuid, public.location_kind, text, jsonb, uuid[], boolean,
  public.engagement_payment_mode, jsonb
) from public;
grant execute on function public.create_request(
  text, text, public.timing_type, timestamptz, timestamptz, timestamptz,
  numeric, uuid, public.location_kind, text, jsonb, uuid[], boolean,
  public.engagement_payment_mode, jsonb
) to authenticated;

-- ---------------------------------------------------------------------------
-- submit_request_response — milestone acceptance / counter-proposal
-- ---------------------------------------------------------------------------
create or replace function public.submit_request_response(
  p_request_id uuid,
  p_message text,
  p_proposed_amount numeric,
  p_headline text,
  p_accept_request_milestones boolean default false,
  p_milestone_proposal jsonb default null
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
  v_response_id uuid := gen_random_uuid();
  v_responder_near text;
  v_offer_status public.milestone_offer_status := 'not_applicable';
  v_elem jsonb;
  v_pos smallint;
  v_amount numeric(78, 0);
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  v_responder_near := public.require_auth_linked_near_account();

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
  if not public.profile_has_usable_photo(v_uid) then
    raise exception 'Add a profile photo (Account settings) before responding';
  end if;

  select allow_cross_asset_responses into v_cfg from public.app_config where id = 1;
  if coalesce(v_cfg, false) then
    raise exception 'Cross-asset responses are disabled';
  end if;

  select * into v_pp_record from public.provider_profiles where user_id = v_uid;
  if not found then
    insert into public.provider_profiles (user_id, headline, kind)
    values (v_uid, nullif(trim(coalesce(p_headline, '')), ''), 'human')
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
    where rr.request_id = p_request_id and rr.provider_profile_id = v_pp_id
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
  if not exists (select 1 from public.assets where id = v_req.budget_asset_id) then
    raise exception 'Invalid request asset';
  end if;

  if v_req.payment_mode = 'milestones'::public.engagement_payment_mode then
    if p_accept_request_milestones then
      if p_milestone_proposal is not null then
        raise exception 'cannot accept and propose milestones together';
      end if;
      perform public.validate_milestone_schedule_json(
        (
          select jsonb_agg(
            jsonb_build_object(
              'position', m.position,
              'title', m.title,
              'description', m.description,
              'amount', m.amount::text
            ) order by m.position
          )
          from public.request_milestones m
          where m.request_id = p_request_id
        ),
        p_proposed_amount
      );
      v_offer_status := 'accepted_as_proposed';
    elsif p_milestone_proposal is not null then
      perform public.validate_milestone_schedule_json(p_milestone_proposal, p_proposed_amount);
      v_offer_status := 'proposal_pending';
    else
      raise exception 'milestone response requires accept or proposal';
    end if;
  elsif p_accept_request_milestones or p_milestone_proposal is not null then
    raise exception 'milestones not applicable';
  end if;

  insert into public.request_responses (
    id, request_id, provider_profile_id, message, proposed_amount,
    proposed_asset_id, status, responder_near_account_id, milestone_offer_status
  ) values (
    v_response_id, p_request_id, v_pp_id,
    nullif(trim(coalesce(p_message, '')), ''),
    p_proposed_amount, v_req.budget_asset_id, 'pending', v_responder_near,
    v_offer_status
  );

  if v_offer_status = 'proposal_pending' then
    for v_elem in
      select value from jsonb_array_elements(p_milestone_proposal)
      order by (value ->> 'position')::int
    loop
      v_pos := (v_elem ->> 'position')::smallint;
      v_amount := (v_elem ->> 'amount')::numeric(78, 0);
      insert into public.request_response_milestone_proposals (
        response_id, position, title, description, amount
      ) values (
        v_response_id, v_pos, trim(v_elem ->> 'title'),
        coalesce(v_elem ->> 'description', ''), v_amount
      );
    end loop;
  end if;

  insert into public.conversations (request_id, kind, response_id)
  values (p_request_id, 'pre_accept', v_response_id);

  insert into public.notifications (user_id, kind, title, body, request_id, response_id)
  values (
    v_req.requester_id,
    case
      when v_offer_status = 'proposal_pending'::public.milestone_offer_status
      then 'request_new_response'::public.notification_kind
      else 'request_new_response'::public.notification_kind
    end,
    case
      when v_offer_status = 'proposal_pending'::public.milestone_offer_status
      then 'Milestone proposal to review'
      else 'New response on your request'
    end,
    case
      when v_offer_status = 'proposal_pending'::public.milestone_offer_status
      then 'A provider proposed milestone changes on your task.'
      else 'Someone submitted an offer on one of your requests.'
    end,
    p_request_id,
    v_response_id
  );

  return v_response_id;
end;
$$;

revoke all on function public.submit_request_response(
  uuid, text, numeric, text, boolean, jsonb
) from public;
grant execute on function public.submit_request_response(
  uuid, text, numeric, text, boolean, jsonb
) to authenticated;

-- ---------------------------------------------------------------------------
-- review_response_milestone_proposal (requester)
-- ---------------------------------------------------------------------------
create or replace function public.review_response_milestone_proposal(
  p_response_id uuid,
  p_action text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rr public.request_responses%rowtype;
  v_req public.requests%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_action not in ('approve', 'reject') then
    raise exception 'invalid action';
  end if;

  select * into v_rr from public.request_responses where id = p_response_id for update;
  if not found or v_rr.status <> 'pending'::public.response_status then
    raise exception 'Response not available';
  end if;

  select * into v_req from public.requests where id = v_rr.request_id;
  if v_req.requester_id is distinct from v_uid then
    raise exception 'Only the requester may review';
  end if;
  if v_rr.milestone_offer_status <> 'proposal_pending'::public.milestone_offer_status then
    raise exception 'No milestone proposal pending';
  end if;

  if p_action = 'approve' then
    update public.request_responses
    set milestone_offer_status = 'agreed'::public.milestone_offer_status,
        updated_at = now()
    where id = p_response_id;

    insert into public.notifications (user_id, kind, title, body, request_id, response_id)
    values (
      (select pp.user_id from public.provider_profiles pp where pp.id = v_rr.provider_profile_id),
      'request_new_response'::public.notification_kind,
      'Milestone plan approved',
      'The requester approved your milestone proposal.',
      v_rr.request_id,
      p_response_id
    );
  else
    update public.request_responses
    set milestone_offer_status = 'proposal_rejected'::public.milestone_offer_status,
        updated_at = now()
    where id = p_response_id;

    insert into public.notifications (user_id, kind, title, body, request_id, response_id)
    values (
      (select pp.user_id from public.provider_profiles pp where pp.id = v_rr.provider_profile_id),
      'request_new_response'::public.notification_kind,
      'Milestone proposal declined',
      'The requester declined your milestone proposal.',
      v_rr.request_id,
      p_response_id
    );
  end if;

  return true;
end;
$$;

revoke all on function public.review_response_milestone_proposal(uuid, text) from public;
grant execute on function public.review_response_milestone_proposal(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Agreed milestone rows for acceptance / funding (read-only helper)
-- ---------------------------------------------------------------------------
create or replace function public.get_agreed_milestone_schedule_for_response(
  p_response_id uuid
)
returns table (
  milestone_position smallint,
  milestone_title text,
  milestone_description text,
  milestone_amount numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rr public.request_responses%rowtype;
  v_req public.requests%rowtype;
begin
  select * into v_rr from public.request_responses where id = p_response_id;
  if not found then
    raise exception 'response not found';
  end if;
  select * into v_req from public.requests where id = v_rr.request_id;

  if v_uid is distinct from v_req.requester_id
     and v_uid is distinct from (
       select pp.user_id from public.provider_profiles pp where pp.id = v_rr.provider_profile_id
     ) then
    raise exception 'forbidden';
  end if;

  if v_req.payment_mode <> 'milestones'::public.engagement_payment_mode then
    return;
  end if;

  if v_rr.milestone_offer_status = 'agreed'::public.milestone_offer_status then
    return query
    select p.position, p.title, p.description, p.amount
    from public.request_response_milestone_proposals p
    where p.response_id = p_response_id
    order by p.position;
  elsif v_rr.milestone_offer_status = 'accepted_as_proposed'::public.milestone_offer_status then
    return query
    select m.position, m.title, m.description, m.amount
    from public.request_milestones m
    where m.request_id = v_rr.request_id
    order by m.position;
  end if;
end;
$$;

revoke all on function public.get_agreed_milestone_schedule_for_response(uuid) from public;
grant execute on function public.get_agreed_milestone_schedule_for_response(uuid) to authenticated;

drop policy if exists request_milestones_select_open_or_participant
  on public.request_milestones;

drop view if exists public.requests_public;

create view public.requests_public as
select
  r.id,
  r.title,
  r.description,
  left(r.description, 280) as description_preview,
  r.timing_type,
  r.scheduled_at,
  r.deadline_at,
  r.budget_amount::text as budget_amount,
  r.budget_asset_id,
  a.symbol as asset_symbol,
  a.decimals as asset_decimals,
  r.location_kind,
  r.location_label,
  r.published_at,
  r.created_at,
  r.payment_mode,
  (
    select rp.storage_path
    from public.request_photos rp
    where rp.request_id = r.id
    order by rp.sort_order
    limit 1
  ) as first_photo_path,
  coalesce(
    (
      select jsonb_agg(rp.storage_path order by rp.sort_order)
      from public.request_photos rp
      where rp.request_id = r.id
    ),
    '[]'::jsonb
  ) as photo_paths,
  coalesce(
    (
      select jsonb_agg(elem)
      from (
        select jsonb_build_object(
          'id', t.id,
          'slug', t.slug,
          'label', t.label,
          'category', t.category
        ) as elem,
        t.sort_order
        from public.request_tags rt
        join public.tags t on t.id = rt.tag_id
        where rt.request_id = r.id
        order by t.sort_order
      ) s
    ),
    '[]'::jsonb
  ) as tags
from public.requests r
join public.assets a on a.id = r.budget_asset_id
where r.status = 'open';

grant select on public.requests_public to anon, authenticated;

create policy request_milestones_select_open_or_participant
  on public.request_milestones for select
  to authenticated
  using (
    exists (
      select 1 from public.requests r
      where r.id = request_milestones.request_id
        and r.requester_id = auth.uid()
    )
    or exists (
      select 1 from public.requests_public rp
      where rp.id = request_milestones.request_id
    )
    or exists (
      select 1
      from public.request_responses rr
      join public.provider_profiles pp on pp.id = rr.provider_profile_id
      where rr.request_id = request_milestones.request_id
        and pp.user_id = auth.uid()
    )
  );

create or replace view public.request_responses_api
with (security_invoker = true)
as
select
  id,
  request_id,
  provider_profile_id,
  message,
  proposed_amount::text as proposed_amount,
  proposed_asset_id,
  status,
  responder_near_account_id,
  created_at,
  updated_at,
  milestone_offer_status
from public.request_responses;

grant select on public.request_responses_api to authenticated;
grant select on public.request_responses_api to anon;

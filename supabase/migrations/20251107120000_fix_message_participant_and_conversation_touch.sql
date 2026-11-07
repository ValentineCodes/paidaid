-- Align message participant checks with conversations RLS; bump sidebar ordering on new messages.

create or replace function public.is_conversation_participant(p_conversation_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.conversations c
      join public.requests r on r.id = c.request_id
      where c.id = p_conversation_id
        and r.requester_id = p_user_id
    )
    or exists (
      select 1
      from public.conversations c
      where c.id = p_conversation_id
        and c.kind = 'pre_accept'
        and c.response_id is not null
        and exists (
          select 1
          from public.request_responses rr
          join public.provider_profiles pp on pp.id = rr.provider_profile_id
          where rr.id = c.response_id
            and pp.user_id = p_user_id
        )
    )
    or exists (
      select 1
      from public.conversations c
      join public.engagements e on e.id = c.engagement_id
      join public.assignments a on a.id = e.assignment_id
      where c.id = p_conversation_id
        and c.kind = 'engagement'
        and (a.requester_id = p_user_id or a.provider_user_id = p_user_id)
    );
$$;

revoke all on function public.is_conversation_participant(uuid, uuid) from public;
grant execute on function public.is_conversation_participant(uuid, uuid) to authenticated;

create or replace function public.touch_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation_on_message();

-- Providers may mark delivery complete without notes or profile photo.

alter table public.deliveries drop constraint if exists deliveries_description_len;

alter table public.deliveries add constraint deliveries_description_len check (
  char_length(trim(description)) >= 0
  and char_length(description) <= 4000
);

create or replace function public.submit_delivery(
  p_engagement_id uuid,
  p_description text,
  p_post_to_chat boolean default false
)
returns table (delivery_id uuid, chat_message_id uuid)
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
  v_pay public.engagement_escrow_payments%rowtype;
  v_body text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  v_body := coalesce(trim(p_description), '');
  if char_length(v_body) > 4000 then
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

  if exists (
    select 1 from public.engagement_escrow_payments ep
    where ep.engagement_id = p_engagement_id
  ) then
    select * into v_pay
    from public.engagement_escrow_payments ep
    where ep.engagement_id = p_engagement_id;
    if v_pay.status is distinct from 'funded'::public.engagement_payment_status then
      raise exception 'Escrow must be funded before delivery';
    end if;
  end if;

  select * into v_dlv from public.deliveries where engagement_id = p_engagement_id;

  if not found then
    insert into public.deliveries (
      engagement_id, provider_user_id, status, description, submitted_at
    )
    values (
      p_engagement_id, v_uid, 'pending_review'::public.delivery_status,
      v_body, now()
    )
    returning * into v_dlv;
  elsif v_dlv.status = 'revision_requested'::public.delivery_status then
    delete from public.delivery_attachments where delivery_id = v_dlv.id;
    update public.deliveries
    set description = v_body,
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
    v_asn.requester_id, 'delivery_submitted'::public.notification_kind,
    'Delivery submitted', 'The provider submitted work for your review.',
    v_asn.request_id, p_engagement_id
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
    if v_body = '' then
      v_caption := '[Delivery] Provider marked work complete.';
    else
      v_caption := '[Delivery] ' || left(v_body, 7900);
    end if;
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

-- BEFORE insert: allow exactly 10 attachments (count existing before insert)
drop trigger if exists message_attachments_max_ten on public.message_attachments;

create or replace function public.enforce_message_attachment_max_ten()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  cnt int;
begin
  select count(*) into cnt
  from public.message_attachments
  where message_id = new.message_id;
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

-- Phase 7 follow-up: callers must not invoke completion helper directly; realtime for delivery sync.

revoke execute on function public.complete_engagement_after_delivery(uuid, boolean) from authenticated;
revoke execute on function public.complete_engagement_after_delivery(uuid, boolean) from anon;

do $$ begin
  alter publication supabase_realtime add table public.deliveries;
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.engagement_issues;
exception
  when duplicate_object then null;
end $$;

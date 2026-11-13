-- Supabase grants EXECUTE to anon/authenticated on new functions; restrict service-role RPCs.

revoke all on function public.milestone_intent_is_funded(uuid) from anon, authenticated;
grant execute on function public.milestone_intent_is_funded(uuid) to service_role;

revoke all on function public.mark_milestone_settlement_eligible(uuid) from anon, authenticated;
grant execute on function public.mark_milestone_settlement_eligible(uuid) to service_role;

revoke all on function public.record_milestone_settlement_progress(
  uuid,
  public.engagement_settlement_status,
  text,
  text
) from anon, authenticated;
grant execute on function public.record_milestone_settlement_progress(
  uuid,
  public.engagement_settlement_status,
  text,
  text
) to service_role;

revoke all on function public.complete_engagement_after_milestone_settlement(uuid) from anon, authenticated;
grant execute on function public.complete_engagement_after_milestone_settlement(uuid) to service_role;

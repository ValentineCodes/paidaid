-- V2.2 / V2.1 audit: payment & settlement progress RPCs must be service_role only.

revoke all on function public.record_engagement_payment_progress(
  uuid,
  public.engagement_payment_status,
  bigint,
  text,
  text,
  text
) from anon, authenticated;

revoke all on function public.record_engagement_settlement_progress(
  uuid,
  public.engagement_settlement_status,
  text,
  text
) from anon, authenticated;

grant execute on function public.record_engagement_payment_progress(
  uuid,
  public.engagement_payment_status,
  bigint,
  text,
  text,
  text
) to service_role;

grant execute on function public.record_engagement_settlement_progress(
  uuid,
  public.engagement_settlement_status,
  text,
  text
) to service_role;

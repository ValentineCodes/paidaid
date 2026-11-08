-- Behavioral checks for shared escrow payment RPC guards (requires service_role session).
-- Run via: supabase db query --file scripts/security/shared-escrow-payments-behavior.sql
-- Expect raised exceptions (not applied in CI by default).

do $$
declare
  v_pay public.engagement_escrow_payments%rowtype;
begin
  begin
    perform public.record_engagement_payment_progress(
      gen_random_uuid(),
      'funded'::public.engagement_payment_status,
      null,
      null,
      null,
      null
    );
    raise exception 'expected payment row not found';
  exception
    when others then
      if sqlerrm not like '%payment row not found%' then
        raise;
      end if;
  end;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_proc
    where proname = 'prevent_funded_payment_terms_mutation'
      and pronamespace = 'public'::regnamespace
  ) then
    raise exception 'missing prevent_funded_payment_terms_mutation';
  end if;
end;
$$;

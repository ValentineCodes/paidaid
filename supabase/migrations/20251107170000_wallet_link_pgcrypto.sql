-- Wallet link challenges need cryptographically random nonces (NEP-413).
-- gen_random_bytes lives in pgcrypto (extensions schema on Supabase).

create extension if not exists pgcrypto with schema extensions;

create or replace function public.create_near_wallet_link_challenge(p_near_account_id text)
returns table (
  challenge_id uuid,
  message text,
  nonce_hex text,
  recipient text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_nonce bytea;
  v_id uuid;
  v_expires timestamptz := now() + interval '5 minutes';
  v_recipient text := 'paidaid';
  v_account text := lower(trim(p_near_account_id));
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if v_account is null or v_account = '' then
    raise exception 'invalid near account id' using errcode = '22023';
  end if;
  if v_account !~ '^[a-z0-9._-]+$' then
    raise exception 'invalid near account id format' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.linked_near_wallets w
    where w.user_id = v_user_id and w.unlinked_at is null
  ) then
    raise exception 'wallet already linked' using errcode = '23505';
  end if;
  if exists (
    select 1 from public.linked_near_wallets w
    where lower(trim(w.near_account_id)) = v_account and w.unlinked_at is null
  ) then
    raise exception 'near account already linked' using errcode = '23505';
  end if;

  v_nonce := extensions.gen_random_bytes(32);
  insert into public.wallet_link_challenges (user_id, near_account_id, nonce, expires_at)
  values (v_user_id, v_account, v_nonce, v_expires)
  returning id into v_id;

  return query
  select
    v_id,
    format(
      'Link NEAR account %s to your PaidAid profile. Challenge %s.',
      v_account,
      v_id
    ),
    encode(v_nonce, 'hex'),
    v_recipient,
    v_expires;
end;
$$;

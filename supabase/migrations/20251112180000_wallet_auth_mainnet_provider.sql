-- Wallet auth: mainnet challenges + optional wallet provider id on links.

alter table public.linked_near_wallets
  add column if not exists wallet_provider_id text;

alter table public.linked_near_wallets
  drop constraint if exists linked_near_wallets_wallet_provider_id_len;

alter table public.linked_near_wallets
  add constraint linked_near_wallets_wallet_provider_id_len
  check (
    wallet_provider_id is null
    or (
      char_length(trim(wallet_provider_id)) >= 2
      and char_length(trim(wallet_provider_id)) <= 64
    )
  );

create or replace function public.create_wallet_auth_challenge(
  p_near_account_id text,
  p_network_id text default 'localnet'
)
returns table (
  challenge_id uuid,
  message text,
  nonce_hex text,
  recipient text,
  expires_at timestamptz,
  issued_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_nonce bytea;
  v_id uuid;
  v_expires timestamptz := now() + interval '5 minutes';
  v_issued timestamptz := now();
  v_recipient text := coalesce(
    nullif(trim(current_setting('app.wallet_auth_recipient', true)), ''),
    'paidaid'
  );
  v_account text := lower(trim(p_near_account_id));
  v_network text := lower(trim(coalesce(p_network_id, 'localnet')));
begin
  if v_account is null or v_account = '' or v_account !~ '^[a-z0-9._-]+$' then
    raise exception 'invalid near account id' using errcode = '22023';
  end if;
  if v_network not in ('localnet', 'testnet', 'mainnet') then
    raise exception 'unsupported network' using errcode = '22023';
  end if;

  v_nonce := extensions.gen_random_bytes(32);
  insert into public.wallet_auth_challenges (
    near_account_id,
    network_id,
    nonce,
    expires_at
  )
  values (v_account, v_network, v_nonce, v_expires)
  returning id into v_id;

  return query
  select
    v_id,
    format(
      'Sign in to PaidAid with NEAR account %s. Challenge %s. Network %s. Recipient %s. Issued %s.',
      v_account,
      v_id,
      v_network,
      v_recipient,
      to_char(v_issued at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    ),
    encode(v_nonce, 'hex'),
    v_recipient,
    v_expires,
    v_issued;
end;
$$;

drop function if exists public.complete_wallet_authentication(uuid, uuid, text, text, text);

create or replace function public.complete_wallet_authentication(
  p_challenge_id uuid,
  p_user_id uuid,
  p_near_account_id text,
  p_public_key text,
  p_network_id text,
  p_wallet_provider_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_challenge public.wallet_auth_challenges%rowtype;
  v_account text := lower(trim(p_near_account_id));
  v_network text := lower(trim(coalesce(p_network_id, 'localnet')));
  v_provider text := nullif(trim(coalesce(p_wallet_provider_id, '')), '');
  v_existing_wallet_owner uuid;
  v_link_id uuid;
begin
  if p_user_id is null then
    raise exception 'missing user id' using errcode = '22023';
  end if;
  if v_network not in ('localnet', 'testnet', 'mainnet') then
    raise exception 'unsupported network' using errcode = '22023';
  end if;

  select * into v_challenge
  from public.wallet_auth_challenges
  where id = p_challenge_id
  for update;

  if not found then
    raise exception 'challenge not found' using errcode = '22023';
  end if;
  if v_challenge.used_at is not null then
    raise exception 'challenge already used' using errcode = '23505';
  end if;
  if v_challenge.expires_at <= now() then
    raise exception 'challenge expired' using errcode = '22023';
  end if;
  if lower(trim(v_challenge.near_account_id)) <> v_account then
    raise exception 'account mismatch' using errcode = '22023';
  end if;
  if lower(trim(v_challenge.network_id)) <> v_network then
    raise exception 'network mismatch' using errcode = '22023';
  end if;

  select public.lookup_user_id_by_near_wallet(v_account) into v_existing_wallet_owner;
  if v_existing_wallet_owner is not null and v_existing_wallet_owner <> p_user_id then
    raise exception 'near account already linked to another user' using errcode = '23505';
  end if;

  if exists (
    select 1 from public.linked_near_wallets w
    where w.user_id = p_user_id
      and w.unlinked_at is null
      and lower(trim(w.near_account_id)) is distinct from v_account
  ) then
    raise exception 'user already has a different active wallet' using errcode = '23505';
  end if;

  update public.wallet_auth_challenges
  set used_at = now()
  where id = p_challenge_id;

  select w.id into v_link_id
  from public.linked_near_wallets w
  where w.user_id = p_user_id
    and w.unlinked_at is null
    and lower(trim(w.near_account_id)) = v_account
  limit 1;

  if v_link_id is null then
    insert into public.linked_near_wallets (
      user_id,
      near_account_id,
      public_key,
      link_challenge_id,
      wallet_provider_id
    )
    values (
      p_user_id,
      v_account,
      trim(p_public_key),
      null,
      v_provider
    )
    returning id into v_link_id;
  else
    update public.linked_near_wallets
    set
      public_key = trim(p_public_key),
      wallet_provider_id = coalesce(v_provider, wallet_provider_id)
    where id = v_link_id;
  end if;

  if v_link_id is null then
    raise exception 'wallet link missing after provision' using errcode = '22023';
  end if;

  return p_user_id;
end;
$$;

revoke all on function public.complete_wallet_authentication(uuid, uuid, text, text, text, text) from public;
grant execute on function public.complete_wallet_authentication(uuid, uuid, text, text, text, text) to service_role;

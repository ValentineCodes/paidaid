-- V2: NEAR wallet linking (separate from profiles.id). One active link per user and per account.

create table if not exists public.wallet_link_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  near_account_id text not null,
  nonce bytea not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint wallet_link_challenges_nonce_len check (octet_length(nonce) = 32),
  constraint wallet_link_challenges_near_account_format check (
    char_length(trim(near_account_id)) >= 2
    and char_length(trim(near_account_id)) <= 64
    and near_account_id ~ '^[a-z0-9._-]+$'
  )
);

create index if not exists wallet_link_challenges_user_created
  on public.wallet_link_challenges (user_id, created_at desc);

create index if not exists wallet_link_challenges_unused_expires
  on public.wallet_link_challenges (expires_at)
  where used_at is null;

create table if not exists public.linked_near_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  near_account_id text not null,
  public_key text not null,
  linked_at timestamptz not null default now(),
  unlinked_at timestamptz,
  link_challenge_id uuid references public.wallet_link_challenges (id),
  constraint linked_near_wallets_near_account_format check (
    char_length(trim(near_account_id)) >= 2
    and char_length(trim(near_account_id)) <= 64
    and near_account_id ~ '^[a-z0-9._-]+$'
  ),
  constraint linked_near_wallets_public_key_format check (
    public_key ~ '^(ed25519|secp256k1):[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$'
  )
);

create unique index if not exists linked_near_wallets_one_active_per_user
  on public.linked_near_wallets (user_id)
  where unlinked_at is null;

create unique index if not exists linked_near_wallets_one_active_per_account
  on public.linked_near_wallets (lower(trim(near_account_id)))
  where unlinked_at is null;

create index if not exists linked_near_wallets_user_history
  on public.linked_near_wallets (user_id, linked_at desc);

alter table public.wallet_link_challenges enable row level security;
alter table public.linked_near_wallets enable row level security;

-- Challenges: create and read own only; completion via service_role RPC.
drop policy if exists wallet_link_challenges_select_own on public.wallet_link_challenges;
create policy wallet_link_challenges_select_own
  on public.wallet_link_challenges for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists wallet_link_challenges_insert_own on public.wallet_link_challenges;
create policy wallet_link_challenges_insert_own
  on public.wallet_link_challenges for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and not exists (
      select 1
      from public.linked_near_wallets w
      where w.user_id = auth.uid()
        and w.unlinked_at is null
    )
    and not exists (
      select 1
      from public.linked_near_wallets w
      where lower(trim(w.near_account_id)) = lower(trim(near_account_id))
        and w.unlinked_at is null
    )
  );

-- Linked wallets: read own history; no direct insert/update from clients.
drop policy if exists linked_near_wallets_select_own on public.linked_near_wallets;
create policy linked_near_wallets_select_own
  on public.linked_near_wallets for select
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- create challenge (server-side nonce, bound to user + intended account)
-- ---------------------------------------------------------------------------
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
set search_path = public
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

  v_nonce := gen_random_bytes(32);
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

revoke all on function public.create_near_wallet_link_challenge(text) from public;
grant execute on function public.create_near_wallet_link_challenge(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Apply link after server-side NEP-413 verification (service_role only)
-- ---------------------------------------------------------------------------
create or replace function public.apply_near_wallet_link(
  p_user_id uuid,
  p_challenge_id uuid,
  p_near_account_id text,
  p_public_key text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_challenge public.wallet_link_challenges%rowtype;
  v_account text := lower(trim(p_near_account_id));
  v_link_id uuid;
begin
  if p_user_id is null then
    raise exception 'missing user id' using errcode = '22023';
  end if;

  select * into v_challenge
  from public.wallet_link_challenges
  where id = p_challenge_id
  for update;

  if not found then
    raise exception 'challenge not found' using errcode = '22023';
  end if;
  if v_challenge.user_id <> p_user_id then
    raise exception 'challenge user mismatch' using errcode = '42501';
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
  if exists (
    select 1 from public.linked_near_wallets w
    where w.user_id = p_user_id and w.unlinked_at is null
  ) then
    raise exception 'wallet already linked' using errcode = '23505';
  end if;
  if exists (
    select 1 from public.linked_near_wallets w
    where lower(trim(w.near_account_id)) = v_account and w.unlinked_at is null
  ) then
    raise exception 'near account already linked' using errcode = '23505';
  end if;

  update public.wallet_link_challenges
  set used_at = now()
  where id = p_challenge_id;

  insert into public.linked_near_wallets (
    user_id,
    near_account_id,
    public_key,
    link_challenge_id
  )
  values (
    p_user_id,
    v_account,
    trim(p_public_key),
    p_challenge_id
  )
  returning id into v_link_id;

  return v_link_id;
end;
$$;

revoke all on function public.apply_near_wallet_link(uuid, uuid, text, text) from public;
grant execute on function public.apply_near_wallet_link(uuid, uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Unlink active wallet (soft delete)
-- ---------------------------------------------------------------------------
create or replace function public.unlink_near_wallet()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  update public.linked_near_wallets
  set unlinked_at = now()
  where user_id = v_user_id
    and unlinked_at is null;

  if not found then
    raise exception 'no active linked wallet' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.unlink_near_wallet() from public;
grant execute on function public.unlink_near_wallet() to authenticated;

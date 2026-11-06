-- Phase 1: profiles linked to auth.users (email/password). RLS enabled.
-- Apply with: supabase db push (or supabase migration up against your project).

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  bio text,
  avatar_url text,
  live_profile_photo_path text,
  live_profile_photo_captured_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length check (
    char_length(trim(display_name)) >= 2
    and char_length(trim(display_name)) <= 80
  ),
  constraint profiles_bio_length check (
    bio is null or char_length(bio) <= 500
  )
);

create index if not exists profiles_display_name_lower on public.profiles (lower(trim(display_name)));

create or replace function public.set_profiles_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_profiles_updated_at();

-- Auto-create profile when auth user is created (sign-up must pass display_name in raw_user_meta_data).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  dn text;
begin
  dn := trim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  if dn = '' then
    raise exception 'display_name is required in sign-up metadata';
  end if;
  if char_length(dn) < 2 or char_length(dn) > 80 then
    raise exception 'display_name must be between 2 and 80 characters';
  end if;

  insert into public.profiles (id, display_name, bio, avatar_url)
  values (new.id, dn, null, null);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;

-- Authenticated users can read profiles (marketplace will need display names; no email in this table).
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
  on public.profiles
  for select
  to authenticated
  using (true);

-- Anonymous users cannot read profiles in Phase 1 (no public profile browse yet).
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Inserts only via handle_new_user trigger (RLS has no INSERT policy for authenticated).

comment on table public.profiles is 'App profile; id matches auth.users.id';

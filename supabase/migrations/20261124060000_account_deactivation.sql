-- Deleting an account only switches it off: nothing is erased. The account can't sign in
-- or reach its links and folders any more, and its shared folders stop being shared.
-- To bring one back, as the database owner:
--   update public.account_status set is_active = true, deactivated_at = null where user_id = '<id>';
-- Also: an account's email address can't be changed (each account keeps the one it signed up with).
-- Run after 20261124050000_folder_pin_per_visit.sql.

-- ─── Account status ─────────────────────────────────────────────────────────
-- One row per account that has been switched off; an account without a row is active.
create table if not exists public.account_status (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  is_active       boolean not null default true,
  deactivated_at  timestamptz
);

alter table public.account_status enable row level security;

-- People can see their own status; only deactivate_account() below changes it.
drop policy if exists "Users see their own account status" on public.account_status;
create policy "Users see their own account status"
  on public.account_status for select
  to authenticated
  using ((select auth.uid()) = user_id);

/** False once the signed-in account has been deleted (switched off). */
create or replace function public.account_is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.account_status s where s.user_id = auth.uid() and not s.is_active
  );
$$;

/** Switches off the signed-in account and stops sharing its folders. Its data is kept. */
create or replace function public.deactivate_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  insert into public.account_status (user_id, is_active, deactivated_at)
  values (auth.uid(), false, now())
  on conflict (user_id) do update set is_active = false, deactivated_at = now();

  update public.collections set is_public = false where user_id = auth.uid() and is_public;
  delete from public.vault_unlocks where user_id = auth.uid();
end;
$$;

revoke execute on function public.deactivate_account() from public, anon;
grant execute on function public.account_is_active(), public.deactivate_account() to authenticated;

-- ─── A switched-off account reaches none of its data ────────────────────────
-- Restrictive policies are ANDed with the existing ones, so even a sign-in that hasn't
-- expired yet (on another device) sees and changes nothing.
drop policy if exists "Only active accounts" on public.links;
create policy "Only active accounts"
  on public.links as restrictive for all
  to authenticated
  using ((select public.account_is_active()))
  with check ((select public.account_is_active()));

drop policy if exists "Only active accounts" on public.collections;
create policy "Only active accounts"
  on public.collections as restrictive for all
  to authenticated
  using ((select public.account_is_active()))
  with check ((select public.account_is_active()));

-- ─── Email addresses can't be changed ───────────────────────────────────────
-- The app has no way to change it; this stops it through the auth API too. (To change one
-- by hand anyway, drop this trigger first.) Skipped where auth.users is only a stand-in
-- without email columns (the PGlite tests).
create or replace function public.keep_email_unchanged()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (old.email is not null and new.email is distinct from old.email)
     or (coalesce(new.email_change, '') <> '' and new.email_change is distinct from old.email_change) then
    raise exception 'The email address of an account can''t be changed.' using errcode = '42501';
  end if;
  return new;
end;
$$;

do $migration$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'auth' and table_name = 'users' and column_name = 'email_change'
  ) then
    execute 'drop trigger if exists keep_email_unchanged on auth.users';
    execute 'create trigger keep_email_unchanged before update of email, email_change on auth.users
             for each row execute function public.keep_email_unchanged()';
  else
    raise notice 'auth.users has no email columns: skipping the email guard.';
  end if;
end;
$migration$;

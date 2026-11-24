-- Locked folders now work like password-protected folders: the PIN opens one folder,
-- for one visit. It locks again when you leave it (the app locks it right away; if a tab
-- just disappears, the server closes it 3 minutes after the last sign of life).
-- Run after 20261124040000_profile.sql.

-- ─── Unlocks are per folder ─────────────────────────────────────────────────
-- folder_id = the open folder. The all-zero id means "PIN just checked" (to lock or
-- unlock a folder, or change or remove the PIN) without opening any folder.
delete from public.vault_unlocks; -- whole-device unlocks from before end now
alter table public.vault_unlocks
  add column if not exists folder_id uuid not null default '00000000-0000-0000-0000-000000000000';
alter table public.vault_unlocks drop constraint if exists vault_unlocks_pkey;
alter table public.vault_unlocks add primary key (user_id, session_id, folder_id);

/** True for no folder, a folder that isn't locked, or a locked folder opened with the PIN in this visit. */
create or replace function public.folder_is_open(folder uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select folder is null
    or not exists (select 1 from public.collections c where c.id = folder and c.is_locked)
    or exists (
      select 1 from public.vault_unlocks u
      where u.user_id = auth.uid()
        and u.session_id = public.current_session_id()
        and u.folder_id = folder
        and u.expires_at > now()
    );
$$;

-- A locked folder is renamed, shared or deleted only while it's open.
drop policy if exists "Users change their own folders" on public.collections;
create policy "Users change their own folders"
  on public.collections for update
  to authenticated
  using ((select auth.uid()) = user_id and public.folder_is_open(id))
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users delete their own folders" on public.collections;
create policy "Users delete their own folders"
  on public.collections for delete
  to authenticated
  using ((select auth.uid()) = user_id and public.folder_is_open(id));

/** { hasPin, blockedUntil, openFolders: [ids open in this visit], pinChecked } for this browser. */
create or replace function public.vault_status()
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
    'hasPin', exists (select 1 from public.vaults where user_id = auth.uid()),
    'blockedUntil', (
      select v.blocked_until from public.vaults v where v.user_id = auth.uid() and v.blocked_until > now()
    ),
    'openFolders', coalesce((
      select json_agg(u.folder_id)
      from public.vault_unlocks u
      where u.user_id = auth.uid()
        and u.session_id = public.current_session_id()
        and u.expires_at > now()
        and u.folder_id <> '00000000-0000-0000-0000-000000000000'
    ), '[]'::json),
    'pinChecked', public.vault_is_unlocked()
  );
$$;

/** Sets the PIN (changing it needs the current one checked first) and marks it as just checked. */
create or replace function public.set_vault_pin(new_pin text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  session uuid := public.current_session_id();
  salt text := gen_random_uuid()::text;
begin
  if auth.uid() is null or session is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if coalesce(new_pin, '') !~ '^[0-9]{4}$' then
    raise exception 'The PIN must be 4 digits.' using errcode = '22023';
  end if;
  if exists (select 1 from public.vaults where user_id = auth.uid()) and not public.vault_is_unlocked() then
    raise exception 'Enter your current PIN first.' using errcode = '42501';
  end if;

  insert into public.vaults (user_id, pin_salt, pin_hash)
  values (auth.uid(), salt, public.pin_digest(salt, new_pin))
  on conflict (user_id) do update
    set pin_salt = excluded.pin_salt, pin_hash = excluded.pin_hash,
        failed_attempts = 0, blocked_until = null, updated_at = now();

  -- Just checked, so a folder can be locked straight after; no folder is opened.
  insert into public.vault_unlocks (user_id, session_id, folder_id, expires_at)
  values (auth.uid(), session, '00000000-0000-0000-0000-000000000000', now() + interval '3 minutes')
  on conflict (user_id, session_id, folder_id) do update set expires_at = excluded.expires_at;

  return json_build_object('ok', true);
end;
$$;

/**
 * Checks the PIN. With a folder, opens that folder for this visit; without, only marks the
 * PIN as checked. 5 wrong tries pause PIN entry for 1 minute, then 2, 4 … up to an hour.
 */
drop function if exists public.unlock_vault(text);
create or replace function public.unlock_vault(pin text, folder uuid default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  session uuid := public.current_session_id();
  vault public.vaults;
begin
  if auth.uid() is null or session is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  select * into vault from public.vaults where user_id = auth.uid() for update;
  if not found then
    return json_build_object('ok', false, 'error', 'no-pin');
  end if;
  if vault.blocked_until > now() then
    return json_build_object('ok', false, 'error', 'blocked', 'attemptsLeft', 0, 'blockedUntil', vault.blocked_until);
  end if;

  if public.pin_digest(vault.pin_salt, coalesce(pin, '')) = vault.pin_hash then
    update public.vaults set failed_attempts = 0, blocked_until = null where user_id = auth.uid();
    insert into public.vault_unlocks (user_id, session_id, folder_id, expires_at)
    values (auth.uid(), session, coalesce(folder, '00000000-0000-0000-0000-000000000000'), now() + interval '3 minutes')
    on conflict (user_id, session_id, folder_id) do update set expires_at = excluded.expires_at;
    delete from public.vault_unlocks where user_id = auth.uid() and expires_at <= now();
    return json_build_object('ok', true);
  end if;

  update public.vaults
  set failed_attempts = failed_attempts + 1,
      blocked_until = case
        when failed_attempts + 1 >= 5
          then now() + least(interval '60 minutes', interval '1 minute' * power(2, failed_attempts + 1 - 5))
        else null
      end
  where user_id = auth.uid()
  returning * into vault;

  return json_build_object(
    'ok', false,
    'error', case when vault.blocked_until is not null then 'blocked' else 'wrong-pin' end,
    'attemptsLeft', greatest(0, 5 - vault.failed_attempts),
    'blockedUntil', vault.blocked_until
  );
end;
$$;

/** While a locked folder is on screen, the app calls this every minute to keep it open. */
create or replace function public.keep_folder_open(folder uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with kept as (
    update public.vault_unlocks
    set expires_at = now() + interval '3 minutes'
    where user_id = auth.uid()
      and session_id = public.current_session_id()
      and folder_id = folder
      and expires_at > now()
    returning 1
  )
  select exists (select 1 from kept);
$$;

/** Locks one folder again in this browser, or everything (no folder). */
drop function if exists public.lock_vault();
create or replace function public.lock_vault(folder uuid default null)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.vault_unlocks
  where user_id = auth.uid()
    and session_id = public.current_session_id()
    and (folder is null or folder_id = folder);
$$;

/** Locks or unlocks a folder; needs the PIN checked in this browser. Locking closes it everywhere. */
create or replace function public.set_folder_locked(folder uuid, locked boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.vaults where user_id = auth.uid()) then
    raise exception 'Set a PIN first.' using errcode = '42501';
  end if;
  if not public.vault_is_unlocked() then
    raise exception 'Enter your PIN first.' using errcode = '42501';
  end if;

  perform set_config('justlink.folder_lock_change', 'on', true);
  update public.collections
  set is_locked = locked, is_public = case when locked then false else is_public end
  where id = folder and user_id = auth.uid();
  if not found then
    raise exception 'Folder not found.' using errcode = 'P0002';
  end if;
  perform set_config('justlink.folder_lock_change', 'off', true);

  if locked then
    delete from public.vault_unlocks where user_id = auth.uid() and folder_id = folder;
  end if;
end;
$$;

revoke all on function public.unlock_vault(text, uuid) from public, anon;
revoke all on function public.lock_vault(uuid) from public, anon;
revoke all on function public.keep_folder_open(uuid) from public, anon;
grant execute on function public.unlock_vault(text, uuid) to authenticated;
grant execute on function public.lock_vault(uuid) to authenticated;
grant execute on function public.keep_folder_open(uuid) to authenticated;

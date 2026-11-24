-- Locked folders. Any folder can be locked with the account's 4-digit PIN. Its links
-- are then hidden by Row Level Security (not just by the app) until the PIN is entered
-- on that device, and adding, moving or removing them needs the PIN too. Links in
-- locked folders never count toward All links, tags or the other totals.
-- A privacy lock for a shared or unattended device, not encryption.
-- Run after 20261124020000_trash.sql.

alter table public.collections add column if not exists is_locked boolean not null default false;

-- ─── The PIN, and which devices have it entered ─────────────────────────────

create table if not exists public.vaults (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  pin_salt        text not null,
  pin_hash        text not null,
  failed_attempts integer not null default 0,
  blocked_until   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- One row per signed-in browser (auth session) that entered the PIN, until it expires.
create table if not exists public.vault_unlocks (
  user_id    uuid not null references auth.users (id) on delete cascade,
  session_id uuid not null,
  expires_at timestamptz not null,
  primary key (user_id, session_id)
);

-- No policies: nobody reads these tables directly, not even their owner. A 4-digit PIN's
-- hash is quick to guess offline, so only the security definer functions below touch it.
alter table public.vaults enable row level security;
alter table public.vault_unlocks enable row level security;
revoke all on public.vaults, public.vault_unlocks from anon, authenticated;

create or replace function public.pin_digest(salt text, pin text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(salt || ':' || pin, 'UTF8')), 'hex');
$$;

revoke all on function public.pin_digest(text, text) from public, anon, authenticated;

/** The auth session of this request: one per signed-in browser. */
create or replace function public.current_session_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(auth.jwt() ->> 'session_id', '')::uuid;
$$;

/** Whether the PIN was entered in this browser and hasn't expired. */
create or replace function public.vault_is_unlocked()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.vault_unlocks u
    where u.user_id = auth.uid()
      and u.session_id = public.current_session_id()
      and u.expires_at > now()
  );
$$;

/** True for no folder, an unlocked folder, or any folder while the PIN is entered here. */
create or replace function public.folder_is_open(folder uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select folder is null
    or not exists (select 1 from public.collections c where c.id = folder and c.is_locked)
    or public.vault_is_unlocked();
$$;

/** Whether a link in this folder is kept out of All links, tags and totals. */
create or replace function public.in_locked_folder(folder uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select folder is not null and exists (select 1 from public.collections c where c.id = folder and c.is_locked);
$$;

-- ─── Links in a locked folder: hidden and read-only until the PIN is entered ─

drop policy if exists "Users can read their own links" on public.links;
create policy "Users can read their own links"
  on public.links for select
  to authenticated
  using ((select auth.uid()) = user_id and public.folder_is_open(collection_id));

drop policy if exists "Users can add their own links" on public.links;
create policy "Users can add their own links"
  on public.links for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and (collection_id is null or exists (
      select 1 from public.collections c where c.id = collection_id and c.user_id = (select auth.uid())
    ))
    and public.folder_is_open(collection_id)
  );

drop policy if exists "Users can update their own links" on public.links;
create policy "Users can update their own links"
  on public.links for update
  to authenticated
  using ((select auth.uid()) = user_id and public.folder_is_open(collection_id))
  with check (
    (select auth.uid()) = user_id
    and (collection_id is null or exists (
      select 1 from public.collections c where c.id = collection_id and c.user_id = (select auth.uid())
    ))
    and public.folder_is_open(collection_id)
  );

drop policy if exists "Users can delete their own links" on public.links;
create policy "Users can delete their own links"
  on public.links for delete
  to authenticated
  using ((select auth.uid()) = user_id and public.folder_is_open(collection_id));

-- ─── Locked folders: visible by name, changed only with the PIN entered ─────

drop policy if exists "Users manage their own collections" on public.collections;

drop policy if exists "Users see their own folders" on public.collections;
create policy "Users see their own folders"
  on public.collections for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users add their own folders" on public.collections;
create policy "Users add their own folders"
  on public.collections for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users change their own folders" on public.collections;
create policy "Users change their own folders"
  on public.collections for update
  to authenticated
  using ((select auth.uid()) = user_id and (not is_locked or public.vault_is_unlocked()))
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users delete their own folders" on public.collections;
create policy "Users delete their own folders"
  on public.collections for delete
  to authenticated
  using ((select auth.uid()) = user_id and (not is_locked or public.vault_is_unlocked()));

-- A folder is locked or unlocked only through set_folder_locked() (which needs the PIN),
-- and a locked folder can't be shared publicly.
create or replace function public.guard_folder_lock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' and new.is_locked) or (tg_op = 'UPDATE' and new.is_locked is distinct from old.is_locked) then
    if coalesce(current_setting('justlink.folder_lock_change', true), '') <> 'on' then
      raise exception 'Lock or unlock a folder with your PIN.' using errcode = '42501';
    end if;
  end if;
  if new.is_locked and new.is_public then
    raise exception 'A locked folder can''t be shared.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists collections_guard_lock on public.collections;
create trigger collections_guard_lock
  before insert or update on public.collections
  for each row execute function public.guard_folder_lock();

-- ─── PIN functions (the only way in) ────────────────────────────────────────

/** { hasPin, unlockedUntil, blockedUntil } for this user and browser. */
create or replace function public.vault_status()
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
    'hasPin', exists (select 1 from public.vaults where user_id = auth.uid()),
    'unlockedUntil', (
      select u.expires_at from public.vault_unlocks u
      where u.user_id = auth.uid() and u.session_id = public.current_session_id() and u.expires_at > now()
    ),
    'blockedUntil', (
      select v.blocked_until from public.vaults v where v.user_id = auth.uid() and v.blocked_until > now()
    )
  );
$$;

/** Sets the PIN (changing it needs the current one entered here first) and unlocks this browser. */
create or replace function public.set_vault_pin(new_pin text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  session uuid := public.current_session_id();
  salt text := gen_random_uuid()::text;
  until timestamptz := now() + interval '10 minutes';
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

  insert into public.vault_unlocks (user_id, session_id, expires_at)
  values (auth.uid(), session, until)
  on conflict (user_id, session_id) do update set expires_at = excluded.expires_at;

  return json_build_object('ok', true, 'unlockedUntil', until);
end;
$$;

/**
 * Enters the PIN in this browser for 10 minutes. After 5 wrong tries it pauses for
 * 1 minute, then 2, 4 … up to an hour. Returns { ok, error?, attemptsLeft?, blockedUntil?, unlockedUntil? }.
 */
create or replace function public.unlock_vault(pin text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  session uuid := public.current_session_id();
  vault public.vaults;
  until timestamptz := now() + interval '10 minutes';
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
    insert into public.vault_unlocks (user_id, session_id, expires_at)
    values (auth.uid(), session, until)
    on conflict (user_id, session_id) do update set expires_at = excluded.expires_at;
    delete from public.vault_unlocks where user_id = auth.uid() and expires_at <= now();
    return json_build_object('ok', true, 'unlockedUntil', until);
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

/** Locks this browser again right away. */
create or replace function public.lock_vault()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.vault_unlocks
  where user_id = auth.uid() and session_id = public.current_session_id();
$$;

/** Locks or unlocks one of the user's folders. Needs a PIN, entered in this browser. */
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
end;
$$;

/**
 * Forgot the PIN: removes it and unlocks every folder. Allowed only within 10 minutes of
 * signing in with the account password, so someone who merely finds the browser signed in can't.
 */
create or replace function public.reset_vault()
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  claims jsonb := auth.jwt();
  signed_in_at bigint;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if jsonb_typeof(claims -> 'amr') = 'array' then
    select max((entry ->> 'timestamp')::bigint) into signed_in_at from jsonb_array_elements(claims -> 'amr') entry;
  end if;
  if signed_in_at is null or signed_in_at < extract(epoch from now()) - 600 then
    return json_build_object('ok', false, 'error', 'sign-in-again');
  end if;

  perform set_config('justlink.folder_lock_change', 'on', true);
  update public.collections set is_locked = false where user_id = auth.uid() and is_locked;
  perform set_config('justlink.folder_lock_change', 'off', true);
  delete from public.vault_unlocks where user_id = auth.uid();
  delete from public.vaults where user_id = auth.uid();
  return json_build_object('ok', true);
end;
$$;

revoke all on function public.vault_status() from public, anon;
revoke all on function public.set_vault_pin(text) from public, anon;
revoke all on function public.unlock_vault(text) from public, anon;
revoke all on function public.lock_vault() from public, anon;
revoke all on function public.set_folder_locked(uuid, boolean) from public, anon;
revoke all on function public.reset_vault() from public, anon;
grant execute on function public.vault_status() to authenticated;
grant execute on function public.set_vault_pin(text) to authenticated;
grant execute on function public.unlock_vault(text) to authenticated;
grant execute on function public.lock_vault() to authenticated;
grant execute on function public.set_folder_locked(uuid, boolean) to authenticated;
grant execute on function public.reset_vault() to authenticated;

-- ─── Counts and sharing leave locked folders out ────────────────────────────

create or replace function public.get_library_stats()
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  with visible as (
    -- Links in locked folders never count toward All links, tags or the Trash total.
    select * from public.links l where not public.in_locked_folder(l.collection_id)
  )
  select json_build_object(
    'total',     (select count(*) from visible where deleted_at is null and not is_archived),
    'favorites', (select count(*) from visible where deleted_at is null and is_favorite and not is_archived),
    'unsorted',  (select count(*) from visible where deleted_at is null and collection_id is null and not is_archived),
    'archived',  (select count(*) from visible where deleted_at is null and is_archived),
    'pending',   (select count(*) from visible where deleted_at is null and fetch_status = 'pending'),
    'trash',     (select count(*) from visible where deleted_at is not null),
    -- Per folder, a locked folder's count shows only while it's unlocked (RLS hides its links otherwise).
    'collections', coalesce((
      select json_object_agg(collection_id, n)
      from (select collection_id, count(*) as n from public.links
            where deleted_at is null and collection_id is not null and not is_archived group by collection_id) s
    ), '{}'::json),
    'tags', coalesce((
      select json_agg(json_build_object('tag', tag, 'count', n) order by n desc, tag)
      from (select tag, count(*) as n from visible, unnest(tags) as tag
            where deleted_at is null and not is_archived group by tag) t
    ), '[]'::json)
  );
$$;

create or replace function public.get_shared_collection(p_share_id uuid)
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
    'name', c.name,
    'icon', c.icon,
    'links', coalesce((
      select json_agg(json_build_object(
        'id', l.id,
        'url', l.url,
        'title', coalesce(l.custom_title, l.title),
        'description', coalesce(l.custom_description, l.description),
        'image', l.image,
        'image_alt', l.image_alt,
        'favicon', l.favicon,
        'site_name', l.site_name,
        'theme_color', l.theme_color,
        'tags', l.tags,
        'created_at', l.created_at
      ) order by l.created_at desc)
      from public.links l
      where l.collection_id = c.id and not l.is_archived and l.deleted_at is null
    ), '[]'::json)
  )
  from public.collections c
  where c.share_id = p_share_id and c.is_public and not c.is_locked;
$$;

revoke all on function public.get_shared_collection(uuid) from public;
grant execute on function public.get_shared_collection(uuid) to anon, authenticated;

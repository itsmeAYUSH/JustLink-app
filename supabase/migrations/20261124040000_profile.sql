-- The profile page: profile photos, and removing a PIN you still know.
-- Name and photo address live in the user's auth metadata, so no new table is needed.
-- Run after 20261124030000_locked_folders.sql.

-- ─── Profile photos ─────────────────────────────────────────────────────────
-- A public "avatars" bucket (photos are shown in the app's header). Each user can add,
-- replace and remove files only in their own folder: avatars/<user id>/…
-- Skipped where Supabase Storage isn't installed (the PGlite tests).
do $migration$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    raise notice 'No storage schema: skipping the avatars bucket.';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update
    set public = true,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  execute $sql$ drop policy if exists "Users see their own avatar files" on storage.objects $sql$;
  execute $sql$
    create policy "Users see their own avatar files" on storage.objects for select to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  $sql$;

  execute $sql$ drop policy if exists "Users add their own avatar" on storage.objects $sql$;
  execute $sql$
    create policy "Users add their own avatar" on storage.objects for insert to authenticated
    with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  $sql$;

  execute $sql$ drop policy if exists "Users replace their own avatar" on storage.objects $sql$;
  execute $sql$
    create policy "Users replace their own avatar" on storage.objects for update to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  $sql$;

  execute $sql$ drop policy if exists "Users remove their own avatar" on storage.objects $sql$;
  execute $sql$
    create policy "Users remove their own avatar" on storage.objects for delete to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  $sql$;
end;
$migration$;

-- ─── Removing a PIN you still know ──────────────────────────────────────────
-- With the PIN entered in this browser, removing it needs no fresh sign-in (reset_vault()
-- is for a forgotten PIN). Every locked folder unlocks; nothing is deleted.
create or replace function public.remove_vault_pin()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.vaults where user_id = auth.uid()) then
    raise exception 'There''s no PIN to remove.' using errcode = 'P0002';
  end if;
  if not public.vault_is_unlocked() then
    raise exception 'Enter your PIN first.' using errcode = '42501';
  end if;

  perform set_config('justlink.folder_lock_change', 'on', true);
  update public.collections set is_locked = false where user_id = auth.uid() and is_locked;
  perform set_config('justlink.folder_lock_change', 'off', true);
  delete from public.vault_unlocks where user_id = auth.uid();
  delete from public.vaults where user_id = auth.uid();
end;
$$;

revoke all on function public.remove_vault_pin() from public, anon;
grant execute on function public.remove_vault_pin() to authenticated;

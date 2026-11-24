-- Trash: deleting a link moves it to the Trash (deleted_at is set) with everything
-- on it (notes, tags, collection, favorite/archive flags), so it can be restored.
-- Links are deleted for good 7 days after they were moved to the Trash.
-- Run after 20261124010000_collections_tags_search.sql.

alter table public.links add column if not exists deleted_at timestamptz;

create index if not exists links_trash_idx on public.links (user_id, deleted_at) where deleted_at is not null;

-- ─── Permanent deletion after 7 days ────────────────────────────────────────
-- Security invoker: called by a signed-in user it only purges their own links (RLS);
-- called by the scheduled job below (as the database owner) it purges everyone's.
create or replace function public.purge_expired_trash()
returns integer
language sql
security invoker
set search_path = ''
as $$
  with purged as (
    delete from public.links
    where deleted_at < now() - interval '7 days'
    returning 1
  )
  select count(*)::integer from purged;
$$;

-- Run it every hour with pg_cron, where it's available (it is on Supabase).
-- Without it, the app still purges a user's expired links whenever they open their library.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    -- Scheduling under an existing job name replaces that job, so re-running is safe.
    perform cron.schedule('justlink-purge-expired-trash', '0 * * * *', 'select public.purge_expired_trash()');
  else
    raise notice 'pg_cron is not available: expired Trash is purged by the app instead.';
  end if;
end;
$$;

-- ─── Sidebar counts: trashed links count only toward "trash" ────────────────
create or replace function public.get_library_stats()
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  select json_build_object(
    'total',     (select count(*) from public.links where deleted_at is null and not is_archived),
    'favorites', (select count(*) from public.links where deleted_at is null and is_favorite and not is_archived),
    'unsorted',  (select count(*) from public.links where deleted_at is null and collection_id is null and not is_archived),
    'archived',  (select count(*) from public.links where deleted_at is null and is_archived),
    'pending',   (select count(*) from public.links where deleted_at is null and fetch_status = 'pending'),
    'trash',     (select count(*) from public.links where deleted_at is not null),
    'collections', coalesce((
      select json_object_agg(collection_id, n)
      from (select collection_id, count(*) as n from public.links
            where deleted_at is null and collection_id is not null and not is_archived group by collection_id) s
    ), '{}'::json),
    'tags', coalesce((
      select json_agg(json_build_object('tag', tag, 'count', n) order by n desc, tag)
      from (select tag, count(*) as n from public.links, unnest(tags) as tag
            where deleted_at is null and not is_archived group by tag) t
    ), '[]'::json)
  );
$$;

-- ─── Public shared collections never show trashed links ─────────────────────
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
  where c.share_id = p_share_id and c.is_public;
$$;

revoke all on function public.get_shared_collection(uuid) from public;
grant execute on function public.get_shared_collection(uuid) to anon, authenticated;

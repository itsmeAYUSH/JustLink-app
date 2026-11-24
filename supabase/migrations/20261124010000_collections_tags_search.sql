-- Organization features found in every competitor (Raindrop, Linkwarden, Karakeep,
-- linkding, linksaver.in): collections, user tags, favorites, archive, notes,
-- user overrides for title/description, full-text search, duplicate detection by
-- normalized URL, background preview fetching (for imports) and public sharing.
-- Run after 20261124000000_create_links.sql.

-- ─── Collections ────────────────────────────────────────────────────────────
create table if not exists public.collections (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  icon        text not null default '📁' check (char_length(icon) <= 16),
  is_public   boolean not null default false,
  -- Unguessable id used in the public URL (/s/<share_id>), separate from the primary key.
  share_id    uuid not null default gen_random_uuid() unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists collections_user_id_idx on public.collections (user_id);

drop trigger if exists collections_set_updated_at on public.collections;
create trigger collections_set_updated_at
  before update on public.collections
  for each row execute function public.set_updated_at();

alter table public.collections enable row level security;

drop policy if exists "Users manage their own collections" on public.collections;
create policy "Users manage their own collections"
  on public.collections for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ─── New link columns ───────────────────────────────────────────────────────
alter table public.links
  add column if not exists collection_id      uuid references public.collections (id) on delete set null,
  add column if not exists tags               text[] not null default '{}',
  add column if not exists note               text,
  -- User edits live in their own columns (the linkding pattern), so "Refresh
  -- metadata" can rewrite the scraped title/description without losing them.
  add column if not exists custom_title       text,
  add column if not exists custom_description text,
  add column if not exists is_favorite        boolean not null default false,
  add column if not exists is_archived        boolean not null default false,
  -- Dedupe key: no scheme, no "www.", no tracking params, sorted query, no trailing slash.
  add column if not exists url_normalized     text,
  -- 'pending' rows (e.g. from an import) still need their preview fetched.
  add column if not exists fetch_status       text not null default 'done'
    check (fetch_status in ('pending', 'done', 'failed')),
  add column if not exists search             tsvector;

-- Backfill the dedupe key for rows saved before this migration.
-- (Saved URLs already have a lowercase host; this matches urlKey() for typical URLs.)
update public.links
set url_normalized = regexp_replace(regexp_replace(url, '^https?://(www\.)?', ''), '/$', '')
where url_normalized is null;

-- The old unique key was the exact URL, so http:// and https:// copies of one page
-- may both exist. Keep them all; the https (then oldest) copy keeps the real key.
update public.links l
set url_normalized = l.url_normalized || '#' || l.id
from (
  select id, row_number() over (
    partition by user_id, url_normalized
    order by (url like 'https:%') desc, created_at, id
  ) as rn
  from public.links
) d
where d.id = l.id and d.rn > 1;

alter table public.links alter column url_normalized set not null;
alter table public.links drop constraint if exists links_user_id_url_key;
create unique index if not exists links_user_id_url_normalized_key on public.links (user_id, url_normalized);

update public.links set fetch_status = 'failed' where fetch_error is not null and fetch_status = 'done';

create index if not exists links_collection_id_idx on public.links (collection_id);
create index if not exists links_tags_idx on public.links using gin (tags);
create index if not exists links_search_idx on public.links using gin (search);
create index if not exists links_pending_idx on public.links (user_id) where fetch_status = 'pending';

-- ─── Full-text search ───────────────────────────────────────────────────────
-- Weighted: title and tags rank above description and notes, which rank above the URL.
-- Everything uses the 'english' config so it matches websearch_to_tsquery('english', ...)
-- (stemming: "frameworks" finds "framework").
create or replace function public.links_update_search()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.search :=
    setweight(to_tsvector('english', coalesce(new.custom_title, '') || ' ' || coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('english', array_to_string(new.tags, ' ') || ' ' || array_to_string(new.keywords, ' ')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.custom_description, '') || ' ' || coalesce(new.description, '') || ' ' || coalesce(new.site_name, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(new.note, '')), 'B') ||
    setweight(to_tsvector('english', regexp_replace(new.url, '[/.?=&:_-]+', ' ', 'g')), 'C');
  return new;
end;
$$;

drop trigger if exists links_update_search on public.links;
create trigger links_update_search
  before insert or update on public.links
  for each row execute function public.links_update_search();

update public.links set search = null; -- fires the trigger for existing rows

-- ─── RLS: a link may only be filed into one of the user's own collections ───
drop policy if exists "Users can add their own links" on public.links;
create policy "Users can add their own links"
  on public.links for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and (collection_id is null or exists (
      select 1 from public.collections c where c.id = collection_id and c.user_id = (select auth.uid())
    ))
  );

drop policy if exists "Users can update their own links" on public.links;
create policy "Users can update their own links"
  on public.links for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (collection_id is null or exists (
      select 1 from public.collections c where c.id = collection_id and c.user_id = (select auth.uid())
    ))
  );

-- ─── Sidebar counts in one round trip (RLS applies: security invoker) ───────
create or replace function public.get_library_stats()
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  select json_build_object(
    'total',     (select count(*) from public.links where not is_archived),
    'favorites', (select count(*) from public.links where is_favorite and not is_archived),
    'unsorted',  (select count(*) from public.links where collection_id is null and not is_archived),
    'archived',  (select count(*) from public.links where is_archived),
    'pending',   (select count(*) from public.links where fetch_status = 'pending'),
    'collections', coalesce((
      select json_object_agg(collection_id, n)
      from (select collection_id, count(*) as n from public.links
            where collection_id is not null and not is_archived group by collection_id) s
    ), '{}'::json),
    'tags', coalesce((
      select json_agg(json_build_object('tag', tag, 'count', n) order by n desc, tag)
      from (select tag, count(*) as n from public.links, unnest(tags) as tag
            where not is_archived group by tag) t
    ), '[]'::json)
  );
$$;

-- ─── Public shared collections ──────────────────────────────────────────────
-- Anyone with the share link can read a public collection's links, but only the
-- fields below (never notes, never other collections). Security definer bypasses
-- RLS, so the function itself is the access check.
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
      where l.collection_id = c.id and not l.is_archived
    ), '[]'::json)
  )
  from public.collections c
  where c.share_id = p_share_id and c.is_public;
$$;

revoke all on function public.get_shared_collection(uuid) from public;
grant execute on function public.get_shared_collection(uuid) to anon, authenticated;

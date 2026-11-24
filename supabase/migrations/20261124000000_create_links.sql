-- Saved links and the metadata scraped from them.
-- Run this in the Supabase SQL editor, or with `npx supabase db push`.

create table if not exists public.links (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  url             text not null check (url ~* '^https?://'),

  -- Scraped metadata (all optional: plenty of pages have none of it)
  final_url       text,
  canonical_url   text,
  status_code     integer,
  content_type    text,
  title           text,
  description     text,
  site_name       text,
  og_type         text,
  image           text,
  image_alt       text,
  image_width     integer,
  image_height    integer,
  favicon         text,
  video           text,
  author          text,
  published_time  text,   -- kept as text: sites publish dates in many formats
  modified_time   text,
  keywords        text[] not null default '{}',
  theme_color     text,
  locale          text,
  twitter_card    text,
  twitter_site    text,
  twitter_creator text,
  meta_tags       jsonb  not null default '[]'::jsonb,  -- [{ "key": "og:title", "value": "..." }, ...]
  fetch_error     text,
  fetched_at      timestamptz,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (user_id, url)
);

create index if not exists links_user_id_created_at_idx on public.links (user_id, created_at desc);

-- Keep updated_at current.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists links_set_updated_at on public.links;
create trigger links_set_updated_at
  before update on public.links
  for each row execute function public.set_updated_at();

-- Row Level Security: every user only ever sees and changes their own links.
alter table public.links enable row level security;

drop policy if exists "Users can read their own links" on public.links;
create policy "Users can read their own links"
  on public.links for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can add their own links" on public.links;
create policy "Users can add their own links"
  on public.links for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own links" on public.links;
create policy "Users can update their own links"
  on public.links for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own links" on public.links;
create policy "Users can delete their own links"
  on public.links for delete
  to authenticated
  using ((select auth.uid()) = user_id);

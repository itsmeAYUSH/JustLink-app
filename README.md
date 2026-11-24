# JustLink

Save URLs and see everything about them: Open Graph image, title, description, site name, favicon, keywords/tags, author, publish date, Twitter card info, theme color, plus every `<meta>` tag on the page.

**Features**

- **Organize:** collections, your own tags (with the page's keywords offered as suggestions), favorites and an archive.
- **Edit and annotate:** your own title, description and notes. These are kept apart from the page's metadata, so refreshing a preview never overwrites them.
- **Search:** full-text search over titles, descriptions, tags, notes and URLs, with web-search syntax: `"exact phrase"`, `-exclude`, `or`, and `#tag`.
- **Grid and list views**, with pagination, and an **Images** switch that shows a plain placeholder instead of preview images.
- **Locked folders:** choose which folders to lock on the profile page, with a 4-digit PIN. Like a password-protected folder, it asks for the PIN every time it's opened and locks again as soon as you leave it (or close the tab). Its links are hidden everywhere else (All links, search, tags, counts), and can't be added, moved or removed without the PIN. Row Level Security enforces it in the database, 5 wrong tries pause PIN entry, and a forgotten PIN can be removed after signing in again with the password. It's a privacy lock for a shared or unattended device, not encryption.
- **Duplicate detection:** `http`/`https`, `www.`, trailing slashes, query-parameter order and tracking parameters (`utm_*`, `fbclid`, `gclid`, …) are ignored when checking for duplicates, and tracking parameters are removed before saving.
- **Import** a bookmarks export from Chrome, Edge, Firefox, Safari, Raindrop, Pocket or linkding, or a pasted list of URLs. Folders become collections, and tags and save dates are kept. Previews are fetched in the background.
- **Export** as a bookmarks HTML file (works in any browser) or as JSON.
- **Share** a folder through a public, read-only link (from the ⋯ menu next to its name, which also renames and deletes it). Notes are never shared.
- **Profile page:** profile photo (cropped in the browser, stored in Supabase Storage), name, email change (confirmed by email), password change (checks the current one), and the locked-folder PIN: set, change, remove, lock now, or forgot.
- **Browser extension** for Chrome and Edge: save the page you're on in one click (or Alt+Shift+S, or right-click), file it into a folder, and open many selected links as tabs at once. See [Browser extension](#6-browser-extension-optional).
- **Bookmarklet** to save the page you're on, for browsers without the extension.

Why these features: see [docs/competitor-research.md](docs/competitor-research.md), a teardown of linksaver.in, Raindrop.io, Linkwarden, Karakeep and linkding.

**Stack:** Turborepo · pnpm workspaces · Next.js 16 (App Router, Server Actions) · Supabase (Auth + Postgres with RLS) · TypeScript · Tailwind CSS v4 · Node.js

```
justlink/
├── apps/
│   ├── extension/             Chrome/Edge extension (Manifest V3, plain TypeScript): save, file, open tabs
│   └── web/                   Next.js app
│       ├── app/
│       │   ├── page.tsx           Dashboard: sidebar, search, filters, grid/list, add link
│       │   ├── actions.ts         Server Actions: links, collections, import, sign out
│       │   ├── links/[id]/        Detail page: edit form, all metadata, meta tag table
│       │   ├── import-export/     Import bookmarks, export, bookmarklet
│       │   ├── export/            Download route (HTML / JSON)
│       │   ├── s/[shareId]/       Public shared collection (no login needed)
│       │   ├── login/             Email/password sign-in and sign-up
│       │   ├── api/extension/     JSON API for the browser extension (session, look up, save, update)
│       │   └── auth/confirm/      Email confirmation callback
│       ├── lib/                   Supabase clients, URL filters, background fetching
│       └── proxy.ts               Refreshes the session and protects every route
├── packages/
│   ├── metadata/              @justlink/metadata: URL scraper, URL normalizer, bookmark import/export
│   └── typescript-config/     Shared tsconfig presets
├── supabase/                  @justlink/supabase
│   ├── migrations/            Tables, Row Level Security, full-text search, sharing function
│   └── tests/                 Runs the migrations in PGlite and tests RLS, search and sharing
└── docs/                      Competitor research
```

## Setup

You need **Node.js 22+**, **pnpm** (`npm i -g pnpm`) and a free [Supabase](https://supabase.com) project.

### 1. Install

```bash
pnpm install
```

### 2. Create the database tables

In the Supabase dashboard, open **SQL Editor** and run these files, in this order:

1. [`supabase/migrations/20261124000000_create_links.sql`](supabase/migrations/20261124000000_create_links.sql)
2. [`supabase/migrations/20261124010000_collections_tags_search.sql`](supabase/migrations/20261124010000_collections_tags_search.sql)
3. [`supabase/migrations/20261124020000_trash.sql`](supabase/migrations/20261124020000_trash.sql): the Trash, and an hourly job (pg_cron) that deletes links 7 days after they were trashed
4. [`supabase/migrations/20261124030000_locked_folders.sql`](supabase/migrations/20261124030000_locked_folders.sql): locked folders, the PIN and the database rules that hide their links
5. [`supabase/migrations/20261124040000_profile.sql`](supabase/migrations/20261124040000_profile.sql): the `avatars` storage bucket for profile photos, and removing a PIN you know
6. [`supabase/migrations/20261124050000_folder_pin_per_visit.sql`](supabase/migrations/20261124050000_folder_pin_per_visit.sql): a locked folder opens for one visit and locks again when you leave it

If you already ran some of them, run just the ones after: each upgrades existing data in place.

Or, with the Supabase CLI:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

### 3. Add your keys

```bash
cp apps/web/.env.example apps/web/.env.local
```

Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. You'll find both in the dashboard under **Connect** or **Project Settings → API Keys**. The legacy `anon` key also works.

### 4. Configure auth

In **Authentication → URL Configuration**:

- **Site URL:** `http://localhost:3000`
- **Redirect URLs:** add `http://localhost:3000/auth/confirm`

Supabase requires email confirmation by default, so new users get a confirmation link that opens `/auth/confirm`. For faster local testing you can switch off **Authentication → Sign In / Providers → Email → Confirm email**, and sign-up will log users in straight away.

*Optional:* so confirmation links also work when opened in a different browser, change the **Confirm signup** email template link to:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Confirm your email</a>
```

`/auth/confirm` accepts this link style and the default one.

### 5. Run

```bash
pnpm dev
```

Open http://localhost:3000, create an account and paste a link.

### 6. Browser extension (optional)

```bash
pnpm --filter extension build
```

Then in Chrome or Edge open `chrome://extensions` (`edge://extensions`), switch on **Developer mode**, click **Load unpacked** and pick `apps/extension/dist`. Pin the JustLink icon to the toolbar.

- **Sign in once on the website.** The extension uses that same session, so it has no sign-in of its own.
- **Click the icon** (or press Alt+Shift+S) on any page. Nothing is saved until you press **Save**: first pick a folder (none by default: it just goes into All links; press 1–9 to pick one, or type a new folder name), adjust the title, and add tags or a note if you like. A page you saved before opens with its folder, tags and note, ready to **Update**. **Ctrl+Enter** (⌘+Enter on a Mac) saves from anywhere in the popup. Right-click a page or a link for a quick **Save to JustLink**, with no folder.
- **Better previews:** the extension sends the page's `<head>` as your browser sees it, so pages behind bot checks or a login get their real title and image.
- **Open selected links as tabs:** with the extension installed, **Open** in the dashboard's selection bar opens every link at once, with no pop-up blocking.

For your live site, build it for that address (the extension only gets access to that one site):

```bash
JUSTLINK_APP_URL=https://your-domain.com pnpm --filter extension build
```

After changing the extension's code, run the build again and click the reload icon on its card in `chrome://extensions`. To work on the popup's design without reloading, `pnpm --filter extension preview` shows every popup state with sample data at http://localhost:4599/preview/.

## Scripts

Run these from the repo root. Turborepo runs them in every package, in dependency order, and caches the results.

| Command            | What it does                                                |
| ------------------ | ----------------------------------------------------------- |
| `pnpm dev`         | Builds `@justlink/metadata`, then runs it in watch mode alongside `next dev` |
| `pnpm build`       | Production build of everything                              |
| `pnpm start`       | Builds, then serves the production app                      |
| `pnpm test`        | Runs the scraper tests, and runs both migrations in PGlite (Postgres in WebAssembly, no Docker needed) to test Row Level Security, search, duplicates and sharing |
| `pnpm lint`        | Runs ESLint                                                 |
| `pnpm check-types` | Runs the TypeScript type checker in every package           |

## How it works

1. You paste a URL. The `addLink` Server Action normalizes it (`example.com` → `https://example.com/`, tracking parameters removed) and computes a duplicate key (`urlKey()`). If you already have a link with that key, it shows you that link instead.
2. `fetchMetadata()` from `@justlink/metadata` downloads the page on the server (Node.js runtime) and parses it with cheerio. It stops reading at `</head>`, or after 2 MiB, with a 10-second timeout.
3. The result goes into the `links` table with your `user_id`. Row Level Security means each user can only read and change their own rows, and can only file links into their own collections.
4. If the page can't be fetched (timeout, DNS failure and so on), the link is still saved, with the reason shown on its card. **Refresh metadata** on the detail page tries again.
5. **Imports** save every link right away with `fetch_status = 'pending'`. Previews are then fetched six at a time by `processPendingLinks()`, which runs in Next.js `after()` once the response has been sent. The dashboard refreshes while previews arrive. On serverless hosts a single run is capped by `maxDuration` (300 s), so a very large import may need the **Restart** button in the progress banner.
6. **Search** uses a weighted Postgres `tsvector` that a trigger keeps up to date (title and tags weigh most, then description and notes, then the URL). Queries use `websearch_to_tsquery`.
7. **Shared collections** are served by `get_shared_collection(share_id)`, a `security definer` function that returns only public fields of links in collections marked public.

### What gets extracted

| Field                         | Sources, in priority order                                              |
| ----------------------------- | ----------------------------------------------------------------------- |
| Title                         | `og:title` → `twitter:title` → `<title>`                                |
| Description                   | `og:description` → `twitter:description` → `<meta name="description">`  |
| Image                         | `og:image` (+ width, height, alt) → `twitter:image` → `<link rel="image_src">` |
| Favicon                       | Largest or SVG `rel="icon"` → `apple-touch-icon` → `/favicon.ico`       |
| Tags                          | `keywords`, `news_keywords`, `article:tag`, `video:tag`, `book:tag`     |
| Site name, type, URL          | `og:site_name`, `og:type`, `<link rel="canonical">` / `og:url`          |
| Author, dates                 | `author`, `article:author`, `article:published_time`, `article:modified_time` |
| Twitter                       | `twitter:card`, `twitter:site`, `twitter:creator`                       |
| Other                         | `theme-color`, `og:locale` / `<html lang>`, `og:video`, HTTP status, content type |
| Everything else               | All `<meta>` tags are stored in `meta_tags` and listed on the detail page |

### Security notes

- **SSRF protection:** the server fetches URLs that users type in, so `@justlink/metadata` refuses to connect to loopback, private, link-local (including the cloud metadata address `169.254.169.254`) and other reserved IPv4/IPv6 ranges. It checks literal IPs before every redirect hop, and checks DNS answers at connect time through a custom `lookup`, which also blocks DNS rebinding.
- URLs scraped from pages (images, favicons, canonical links) are kept only if they are `http(s)`, so a page can't inject `javascript:` links.
- Third-party images load with `referrerPolicy="no-referrer"` and fall back to a placeholder if they fail.

## Deploying (Vercel)

Import the repo, set **Root Directory** to `apps/web` (Vercel detects Turborepo and pnpm), and add the same environment variables. Then add `https://<your-domain>/auth/confirm` to the Supabase redirect URLs, and update the Site URL.

## Renaming the app

"JustLink" is a working name.

- **Name shown in the app** (header, login page, page titles, shared pages, bookmarklet, export file names): edit [`apps/web/lib/brand.ts`](apps/web/lib/brand.ts).
- **Package names:** the workspace packages use the `@justlink/` scope (`@justlink/metadata`, `@justlink/typescript-config`, `@justlink/supabase`). To change it, find and replace `@justlink/` in every `package.json`, `tsconfig.json`, `next.config.ts` and source import, then run `pnpm install`.
- **Link-preview user agent:** `JustLinkBot`, set in `packages/metadata/src/fetch-metadata.ts`.

## Regenerating database types

`apps/web/lib/supabase/database.types.ts` is written by hand to match the migration. After you change the schema, regenerate it:

```bash
npx supabase gen types typescript --project-id <your-project-ref> > apps/web/lib/supabase/database.types.ts
```
#   J u s t L i n k  
 
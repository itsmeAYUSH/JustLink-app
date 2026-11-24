# Competitor research: how other link savers manage users' links

*November 2026. Written to decide what to build next in JustLink.*

## How this was researched

| Product | What I looked at | Limits |
| --- | --- | --- |
| [linksaver.in](https://www.linksaver.in/) | The public homepage and its production JavaScript bundle (API routes, UI strings, libraries) | No account created, so the signed-in app wasn't seen running. Its features are inferred from the bundle. |
| [Raindrop.io](https://raindrop.io) | Official [API docs](https://developer.raindrop.io/v1/raindrops) for bookmarks and collections, plus the [search](https://help.raindrop.io/using-search) and [filters](https://help.raindrop.io/filters) help pages | Prices and some help pages (extension, import, AI assistant) not read |
| [Linkwarden](https://github.com/linkwarden/linkwarden) | Its open-source database schema ([`schema.prisma`](https://github.com/linkwarden/linkwarden/blob/main/packages/prisma/schema.prisma)) | Schema only, app not run |
| [Karakeep](https://github.com/karakeep-app/karakeep) (formerly Hoarder) | Its open-source database schema ([`packages/db/schema.ts`](https://github.com/karakeep-app/karakeep/blob/main/packages/db/schema.ts)) | Schema only, app not run |
| [linkding](https://github.com/sissbruecker/linkding) | Its open-source Django models ([`bookmarks/models.py`](https://github.com/sissbruecker/linkding/blob/master/bookmarks/models.py)) | Models only, app not run |

Roundups also mention Wallabag, Pinboard, Anybox and Floccus. Mozilla shut Pocket down in July 2025, which is why many people are looking for a replacement ([Raindrop's list](https://blog.raindrop.io/pocket-alternatives/), [AlternativeTo](https://alternativeto.net/software/raindrop-io/)).

## linksaver.in teardown

**Stack:** a Vite + React single-page app using Redux Toolkit, React Router and axios. It's hosted on Vercel and installable as a PWA (it has a web manifest). The frontend calls its own API at `backendservice.linksaver.in`. It uses Google Analytics, and Tally forms for feedback. The homepage says "Now in Beta — Join 100+ users".

**Auth:** its own email and password endpoints (`/user/create`, `/user/login`, `/user/me`). The bundle shows no Google or GitHub sign-in.

**How it manages links** (from its API routes):

| Area | Endpoints / UI strings | What it tells us |
| --- | --- | --- |
| Bookmarks | `/bookmark/create`, `/bookmark/page`, `/bookmark/edit-title`, `/bookmark/edit-description`, `/bookmark/move-multiple`, `/bookmark/generate-summary` | Users can edit titles and descriptions, move links in bulk, and get an AI summary |
| Status | `/bookmark-status/favorite/:id`, `/bookmark-status/pin/:id` | Favorite and pin are separate flags |
| Collections | `/collection/create`, `/edit`, `/archive`, `/toggle-pin`, `/move`, `/views` | Collections can be archived, pinned and reordered, and their views are counted |
| Sharing | `/collection-share/`, `/collection-share/explore`, `/collection-share/hide`, "Collection likes", "Shared link views" | Public shared collections, a public "explore" feed, likes and view counts |
| Labels and tags | `/user-labels/`, `/user-labels/suggestion`, `/user-labels/generate-default`, `/bookmark-label/multiple`, `/tag/:id` | Two ways to label links, with suggested and auto-generated labels |
| Import | `/import-bookmark/chrome/:id`, "Switching from Chrome, Raindrop, or Notion? Import your data now!" | Import is a main way they win new users |
| Search | `/search/`, "Search collections and links..." | One search box covers both collections and links |

## What everyone does

"✓" means I saw the feature. "not seen" means I didn't find it in the material above, not that the product lacks it.

| Feature | linksaver.in | Raindrop.io | Linkwarden | Karakeep | linkding | JustLink before | JustLink now |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Collections | ✓ pin, archive | ✓ nested | ✓ nested, members | ✓ lists, incl. saved-search lists | ✓ bundles (saved searches) | ✗ | **✓** |
| User tags | ✓ labels + tags | ✓ `tags[]` on each bookmark | ✓ incl. AI tags | ✓ marked as added by AI or by a person | ✓ | ✗ (page keywords only) | **✓** + page keywords as suggestions |
| Favorite / pin | ✓ both | ✓ `important` | ✓ pinned | ✓ `favourited` | not seen | ✗ | **✓** favorite |
| Archive / read later | collections only | not seen (has Trash) | not seen | ✓ `archived` | ✓ `unread`, `is_archived` | ✗ | **✓** |
| Notes and own title/description | ✓ edit title/description | ✓ `note` + highlights | ✓ + highlights | ✓ `note`, `summary` | ✓ own fields kept apart from the page's | ✗ | **✓** (kept apart, like linkding) |
| Search | ✓ | ✓ full text + `#tag`, `type:`, `created:` | ✓ full text | ✓ full text | ✓ | ✗ | **✓** Postgres full-text, `"phrase"`, `-word`, `#tag` |
| Duplicate detection | not seen | ✓ (Pro) | not seen | not seen | ✓ `url_normalized` | exact URL only | **✓** normalized URL, tracking params removed |
| Import / export | ✓ Chrome import | ✓ | ✓ | ✓ | ✓ | ✗ | **✓** any browser's HTML export or a list of URLs; export as HTML/JSON |
| Background fetching | not seen | ✓ `pleaseParse` | ✓ | ✓ `crawlStatus` | ✓ | ✗ (only while you wait) | **✓** `fetch_status` + `after()` |
| Public sharing | ✓ + explore feed, likes | ✓ public link, collaborators | ✓ public, member permissions | ✓ public lists | ✓ `shared` | ✗ | **✓** read-only public link |
| Quick save | PWA | extension, mobile, share sheet | extension, mobile | extension, mobile | extension, bookmarklet | ✗ | **✓** bookmarklet + `/?url=` |
| Views | not seen | list / grid / masonry | ✓ | ✓ | list | grid | **✓** grid / list |
| AI summary / auto-tagging | ✓ | ✓ (assistant) | ✓ | ✓ | not seen | ✗ | ✗ (next up) |
| Archived page copy (screenshot, PDF, reader view) | not seen | ✓ (Pro) | ✓ | ✓ | ✓ snapshots | ✗ | ✗ |
| Broken-link checks | not seen | ✓ (Pro) | not seen | stores the HTTP status of each fetch | not seen | ✗ | ✗ |
| Highlights | not seen | ✓ | ✓ | ✓ | not seen | ✗ | ✗ |
| Bulk actions | ✓ bulk move | ✓ | not seen | not seen | ✓ | ✗ | ✗ |

## Design ideas we took

1. **Keep the user's edits apart from what the page says** (linkding has `title` and `website_title`). We added `custom_title`, `custom_description` and `note`, so **Refresh metadata** never overwrites the user's edits.
2. **A normalized URL for duplicates** (linkding's `url_normalized`). Our `urlKey()` ignores the scheme, `www.`, `utm_*`/`fbclid`/`gclid`-style tracking parameters, query-parameter order and a trailing slash. The database enforces it with a unique index per user.
3. **Tags stored on the link itself** (Raindrop's `tags[]`): one `text[]` column with a GIN index. That makes tag filters fast without a join table.
4. **A fetch status on every link** (Karakeep's `crawlStatus`). Imported links are saved straight away as `pending`, and their previews are fetched in the background.
5. **Unguessable share ids** (every product has public links). A `share_id` separate from the primary key, and a database function that returns only public fields (never notes).
6. **Import from any browser** (linksaver.in leads with it). The standard bookmark HTML file is what every browser and app exports, so one importer covers them all.

## Backlog, in priority order

1. **AI summary and tag suggestions.** Four of the five competitors have this. It could use Claude, switched on by an optional API key, building on the keyword suggestions we already show.
2. **Saving from phones.** Add a PWA share target so links can be saved from the Android share sheet; iOS doesn't support share targets for web apps, so it needs another route. A browser extension would also beat the bookmarklet.
3. **Bulk actions.** Select several links, then move, tag, archive or delete them together.
4. **Broken-link checks.** Re-fetch links on a schedule (Supabase cron) and flag ones that return 404 or no longer resolve.
5. **Archived page copies.** Store a reader-view text copy and a screenshot in Supabase Storage. That also enables searching the full page text.
6. **Nested collections and collaborators.** Read-only or editing access for other users.
7. **Trash** (deleted links recoverable for 30 days), **pin to top**, and an **explore feed** of public collections.

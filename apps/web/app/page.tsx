import Link from "next/link";
import { deleteCollection, setCollectionPublic } from "@/app/actions";
import { AddLinkForm } from "@/components/add-link-form";
import { CopyButton, EditCollectionForm } from "@/components/collection-forms";
import { EmptyTrashButton } from "@/components/empty-trash-button";
import { FolderTabs } from "@/components/folder-tabs";
import { FoldersProvider } from "@/components/folders";
import { LinkCard, LinkRow } from "@/components/link-card";
import { PendingBanner } from "@/components/pending-banner";
import { SelectionProvider, SelectModeToggle } from "@/components/selection";
import { Sidebar } from "@/components/sidebar";
import { SiteHeader } from "@/components/site-header";
import { SubmitButton } from "@/components/submit-button";
import { ToastProvider } from "@/components/toast";
import { hrefFor, parseQuery, readFilters, type Filters } from "@/lib/filters";
import { displayTitle, LIST_COLUMNS, readStats, TRASH_DAYS, trashCutoff, type Collection } from "@/lib/links";
import { siteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

// Background preview fetching (after()) for imports started from this page may run this long.
export const maxDuration = 300;

const PAGE_SIZE = 48;

type CollectionSummary = Pick<Collection, "id" | "name" | "icon" | "is_public" | "share_id">;

function title(filters: Filters, collection: CollectionSummary | undefined): string {
  if (filters.collection) return collection ? `${collection.icon} ${collection.name}` : "Folder";
  if (filters.tag) return `#${filters.tag}`;
  return {
    all: "All links",
    favorites: "★ Favorites",
    unsorted: "📥 Unsorted",
    archived: "🗄 Archive",
    trash: "🗑 Trash",
  }[filters.scope];
}

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const filters = readFilters(params);
  const prefillUrl = typeof params.url === "string" ? params.url.slice(0, 2000) : "";
  const supabase = await createClient();
  const inTrash = !filters.collection && filters.scope === "trash";
  // The folder views: All (every link, in a folder or not), Unsorted and each folder.
  const inFolders =
    !filters.tag && (filters.collection !== null || filters.scope === "all" || filters.scope === "unsorted");
  // The add-link box only shows there: in Favorites, Archive, Trash or a tag, a new link
  // wouldn't be in the list. The bookmarklet's /?url=... always gets it.
  const canAddLinks = Boolean(prefillUrl) || inFolders;

  let query = supabase
    .from("links")
    .select(LIST_COLUMNS, { count: "exact" })
    // The Trash lists the most recently deleted first.
    .order(inTrash ? "deleted_at" : "created_at", { ascending: false })
    .range((filters.page - 1) * PAGE_SIZE, filters.page * PAGE_SIZE - 1);

  // Links past their 7 days never show, even in the moment before the purge below removes them.
  if (inTrash) query = query.gt("deleted_at", trashCutoff());
  else query = query.is("deleted_at", null);

  if (filters.collection) query = query.eq("collection_id", filters.collection).eq("is_archived", false);
  else if (filters.scope === "favorites") query = query.eq("is_favorite", true).eq("is_archived", false);
  else if (filters.scope === "unsorted") query = query.is("collection_id", null).eq("is_archived", false);
  else if (filters.scope === "archived") query = query.eq("is_archived", true);
  else if (filters.scope === "all") query = query.eq("is_archived", false);

  const search = parseQuery(filters.q);
  for (const tag of [filters.tag, ...search.tags]) {
    if (tag) query = query.contains("tags", [tag]);
  }
  // websearch syntax: "exact phrase", -exclude, or. Ranked by title/tags > description/notes > URL.
  if (search.text) query = query.textSearch("search", search.text, { type: "websearch", config: "english" });

  const [{ data: userData }, { data: links, count, error }, { data: collectionRows }, { data: statsJson }] =
    await Promise.all([
      supabase.auth.getUser(),
      query,
      supabase.from("collections").select("id, name, icon, is_public, share_id").order("name"),
      supabase.rpc("get_library_stats"),
      // Deletes this user's links that have been in the Trash for over 7 days. A scheduled
      // job does this hourly where pg_cron is enabled; this covers projects without it.
      supabase.rpc("purge_expired_trash"),
    ]);

  const collections = collectionRows ?? [];
  const byId = new Map(collections.map((collection) => [collection.id, collection]));
  const stats = readStats(statsJson);
  const current = filters.collection ? byId.get(filters.collection) : undefined;
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const shareUrl = current?.is_public ? `${await siteUrl()}/s/${current.share_id}` : null;
  // For multi-select: Shift-click ranges, "Select all" and the delete confirmation.
  const selectable = (links ?? []).map((link) => ({ id: link.id, title: displayTitle(link), url: link.url }));

  const folders = collections.map(({ id, name, icon }) => ({ id, name, icon }));
  const sidebar = <Sidebar filters={filters} stats={stats} collections={collections} />;

  return (
    <ToastProvider>
      <FoldersProvider folders={folders}>
        <SiteHeader email={userData.user?.email} />
        <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 lg:flex-row">
          <aside className="hidden w-60 shrink-0 lg:block">
            <div className="sticky top-6">{sidebar}</div>
          </aside>
          <details className="rounded-lg border border-zinc-200 bg-white p-2 lg:hidden dark:border-zinc-800 dark:bg-zinc-900">
            <summary className="cursor-pointer px-2 py-1 text-sm font-medium">Browse: {title(filters, current)}</summary>
            <div className="pt-2">{sidebar}</div>
          </details>

          <main className="min-w-0 flex-1">
            {inFolders && <FolderTabs filters={filters} folders={folders} stats={stats} />}

            {canAddLinks && (
              <section className="mb-6 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <AddLinkForm
                  collections={collections}
                  defaultCollection={filters.collection}
                  initialUrl={prefillUrl}
                />
              </section>
            )}

            {stats.pending > 0 && <PendingBanner count={stats.pending} />}

            {filters.collection && current && (
              <section className="mb-4 space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex flex-wrap items-center gap-2">
                  <form action={setCollectionPublic}>
                    <input type="hidden" name="id" value={current.id} />
                    <input type="hidden" name="value" value={String(!current.is_public)} />
                    <SubmitButton variant={current.is_public ? "secondary" : "primary"} pendingText="Saving…" className="py-1.5">
                      {current.is_public ? "Stop sharing" : "Share publicly"}
                    </SubmitButton>
                  </form>
                  {shareUrl && (
                    <>
                      <a href={shareUrl} target="_blank" rel="noopener noreferrer" className="truncate text-sm text-blue-600 hover:underline dark:text-blue-400">
                        {shareUrl}
                      </a>
                      <CopyButton text={shareUrl} />
                    </>
                  )}
                </div>
                <details>
                  <summary className="cursor-pointer text-sm text-zinc-500">Edit folder</summary>
                  <div className="mt-3 flex flex-wrap items-start gap-3">
                    <div className="min-w-64 flex-1">
                      <EditCollectionForm id={current.id} name={current.name} icon={current.icon} />
                    </div>
                    <form action={deleteCollection}>
                      <input type="hidden" name="id" value={current.id} />
                      <SubmitButton variant="danger" pendingText="Deleting…" className="py-1.5">
                        Delete folder (keeps its links)
                      </SubmitButton>
                    </form>
                  </div>
                </details>
              </section>
            )}

            {inTrash && (
              <section className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-950/40 dark:text-amber-100">
                <p className="min-w-60 flex-1">
                  Deleted links stay here for {TRASH_DAYS} days with their notes, tags and folder, then they&apos;re
                  deleted for good. Restore one to put it back where it was.
                </p>
                {stats.trash > 0 && <EmptyTrashButton count={stats.trash} />}
              </section>
            )}

            {/* Keyed by the filters, so moving to another page or view starts a fresh selection. */}
            <SelectionProvider
              key={JSON.stringify(filters)}
              items={selectable}
              mode={inTrash ? "trash" : "library"}
              hasMorePages={pages > 1}
            >
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <h1 className="mr-auto text-lg font-semibold">
                  {title(filters, current)} <span className="text-sm font-normal text-zinc-500">{total}</span>
                </h1>
                <form action="/" className="flex min-w-0 flex-1 sm:max-w-sm" role="search">
                  {filters.collection && <input type="hidden" name="collection" value={filters.collection} />}
                  {!filters.collection && filters.scope !== "all" && <input type="hidden" name="filter" value={filters.scope} />}
                  {filters.tag && <input type="hidden" name="tag" value={filters.tag} />}
                  {filters.view !== "grid" && <input type="hidden" name="view" value={filters.view} />}
                  <input
                    type="search"
                    name="q"
                    defaultValue={filters.q}
                    placeholder='Search… try "exact phrase", -word, #tag'
                    aria-label="Search links"
                    className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
                  />
                </form>
                <div className="flex overflow-hidden rounded-lg border border-zinc-300 text-sm dark:border-zinc-700">
                  {(["grid", "list"] as const).map((view) => (
                    <Link
                      key={view}
                      href={hrefFor(filters, { view, page: 1 })}
                      aria-current={filters.view === view ? "page" : undefined}
                      className={`px-3 py-1.5 ${filters.view === view ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}
                    >
                      {view === "grid" ? "▦ Grid" : "☰ List"}
                    </Link>
                  ))}
                </div>
                {selectable.length > 0 && <SelectModeToggle />}
              </div>

              {error && (
                <p className="mb-6 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                  Could not load your links: {error.message}. Have you run every SQL migration in supabase/migrations?
                </p>
              )}

              {links && links.length > 0 ? (
                filters.view === "list" ? (
                  <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
                    {links.map((link) => (
                      <LinkRow key={link.id} link={link} collection={filters.collection ? null : byId.get(link.collection_id ?? "")} />
                    ))}
                  </ul>
                ) : (
                  <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                    {links.map((link) => (
                      <LinkCard key={link.id} link={link} collection={filters.collection ? null : byId.get(link.collection_id ?? "")} />
                    ))}
                  </div>
                )
              ) : (
                !error && (
                  <div className="rounded-xl border border-dashed border-zinc-300 p-12 text-center text-sm text-zinc-500 dark:border-zinc-700">
                    {filters.q || filters.tag
                      ? "Nothing matches. Try other words or clear the filters."
                      : inTrash
                        ? "The Trash is empty."
                        : stats.total + stats.archived === 0
                          ? (
                            <>
                              No links yet. Paste one above, or{" "}
                              <Link href="/import-export" className="font-medium underline">
                                import your browser bookmarks
                              </Link>
                              .
                            </>
                          )
                          : "Nothing here yet."}
                  </div>
                )
              )}

              {pages > 1 && (
                <nav className="mt-6 flex items-center justify-center gap-3 text-sm" aria-label="Pagination">
                  {filters.page > 1 && (
                    <Link href={hrefFor(filters, { page: filters.page - 1 })} className="rounded-md border border-zinc-300 px-3 py-1.5 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
                      ← Newer
                    </Link>
                  )}
                  <span className="text-zinc-500">
                    Page {filters.page} of {pages}
                  </span>
                  {filters.page < pages && (
                    <Link href={hrefFor(filters, { page: filters.page + 1 })} className="rounded-md border border-zinc-300 px-3 py-1.5 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
                      Older →
                    </Link>
                  )}
                </nav>
              )}
            </SelectionProvider>
          </main>
        </div>
      </FoldersProvider>
    </ToastProvider>
  );
}

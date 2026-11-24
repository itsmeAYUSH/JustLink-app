import Link from "next/link";
import type { ReactNode } from "react";
import { hrefFor, type Filters } from "@/lib/filters";
import { displayTitle, TRASH_DAYS, type Collection, type LibraryStats, type LinkListItem } from "@/lib/links";
import type { GridColumns } from "@/lib/preferences";
import type { Profile } from "@/lib/profile";
import type { VaultStatus } from "@/lib/vault";
import { AddLinkForm } from "./add-link-form";
import { Frame } from "./app-frame";
import { EmptyTrashButton } from "./empty-trash-button";
import { FolderMenu } from "./folder-menu";
import { GridIcon, LayersIcon, ListIcon, SearchIcon, TrashIcon } from "./icons";
import { GridColumnsToggle } from "./grid-columns-toggle";
import { ImagesToggle } from "./images-toggle";
import { LinkCard, LinkRow } from "./link-card";
import { PendingBanner } from "./pending-banner";
import { SelectionProvider, SelectModeToggle } from "./selection";
import { FolderSession, LockedFolderScreen } from "./vault";

export type LibraryFolder = Pick<Collection, "id" | "name" | "icon" | "is_public" | "is_locked" | "share_id">;

export type LibraryViewProps = {
  user: Profile | null;
  filters: Filters;
  collections: LibraryFolder[];
  vault: VaultStatus;
  stats: LibraryStats;
  links: LinkListItem[];
  /** Links matching the filters, across every page. */
  total: number;
  pages: number;
  error: string | null;
  hideImages: boolean;
  /** The most cards per row in the grid view. */
  gridColumns: GridColumns;
  /** From the bookmarklet's /?url=… */
  prefillUrl: string;
  shareUrl: string | null;
};

/**
 * The grid follows the room it has (a container query), not the window, since the sidebar
 * takes part of it: each card stays at least about 200px wide, so a narrow space shows
 * fewer than the chosen number per row.
 */
const GRID_COLUMNS: Record<GridColumns, string> = {
  3: "@xl:grid-cols-2 @3xl:grid-cols-3",
  4: "@xl:grid-cols-2 @3xl:grid-cols-3 @4xl:grid-cols-4",
  5: "@lg:grid-cols-2 @2xl:grid-cols-3 @4xl:grid-cols-4 @5xl:grid-cols-5",
};

/** More cards per row get a wider page on big screens, so the cards keep a similar size. */
const PAGE_WIDTH: Record<GridColumns, string> = {
  3: "max-w-6xl",
  4: "max-w-7xl",
  5: "max-w-[100rem]",
};

function title(filters: Filters, folder: LibraryFolder | undefined): ReactNode {
  if (filters.collection) {
    return folder ? (
      <>
        <span aria-hidden="true" className="mr-2 font-normal">
          {folder.icon}
        </span>
        {folder.name}
      </>
    ) : (
      "Folder"
    );
  }
  if (filters.tag) return `#${filters.tag}`;
  return { all: "All links", favorites: "Favorites", unsorted: "No folder", archived: "Archive", trash: "Trash" }[
    filters.scope
  ];
}

/** The signed-in library: the sidebar, the add box and the links, from data the page loaded. */
export function LibraryView({
  user,
  filters,
  collections,
  vault,
  stats,
  links,
  total,
  pages,
  error,
  hideImages,
  gridColumns,
  prefillUrl,
  shareUrl,
}: LibraryViewProps) {
  const inTrash = !filters.collection && filters.scope === "trash";
  // The folder views: All (every link, in a folder or not), No folder and each folder.
  const inFolders =
    !filters.tag && (filters.collection !== null || filters.scope === "all" || filters.scope === "unsorted");
  const byId = new Map(collections.map((collection) => [collection.id, collection]));
  const current = filters.collection ? byId.get(filters.collection) : undefined;
  // Locked folders opened with the PIN for this visit (they lock again when left).
  const openFolders = vault.openFolders;
  // A locked folder shows its lock screen until the PIN is entered in this browser.
  const lockedAway = Boolean(current?.is_locked && !openFolders.includes(current.id));
  // The add-link box only shows in the folder views: in Favorites, Archive, Trash or a tag, a new
  // link wouldn't be in the list. The bookmarklet's /?url=... always gets it.
  const canAddLinks = !lockedAway && (Boolean(prefillUrl) || inFolders);
  // For multi-select: Shift-click ranges, "Select all" and the delete confirmation.
  const selectable = links.map((link) => ({ id: link.id, title: displayTitle(link), url: link.url }));

  const header = (
    <>
      <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg">{title(filters, current)}</h1>
      {!lockedAway && (
        <>
          <span className="shrink-0 pt-0.5 text-xs font-medium text-muted tabular-nums sm:text-sm">{total}</span>
          {current && (
            <FolderMenu
              folder={{
                id: current.id,
                name: current.name,
                icon: current.icon,
                isPublic: current.is_public,
                isLocked: current.is_locked,
                shareId: current.share_id,
              }}
              shareUrl={shareUrl}
              linkCount={stats.collections[current.id] ?? 0}
              current
            />
          )}
        </>
      )}
    </>
  );

  return (
    <Frame data={{ user, collections, stats, vault }} filters={filters} header={header}>
      <main className={`@container mx-auto flex w-full ${PAGE_WIDTH[gridColumns]} min-w-0 flex-1 flex-col px-4 pt-4 pb-8 sm:px-6 sm:pt-5 lg:px-8`}>
        {canAddLinks && (
          <section className="mb-4 rounded-xl border border-line bg-surface p-4">
            <AddLinkForm collections={collections} defaultCollection={filters.collection} initialUrl={prefillUrl} />
          </section>
        )}

        {stats.pending > 0 && <PendingBanner count={stats.pending} />}

        {current?.is_locked && !lockedAway && <FolderSession key={current.id} folderId={current.id} />}

        {inTrash && (
          <section className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
            <TrashIcon className="size-4 shrink-0" />
            <p className="min-w-60 flex-1">
              Links stay here for {TRASH_DAYS} days with their notes, tags and folder, then they&apos;re deleted
              for good. Restore one to put it back where it was.
            </p>
            {stats.trash > 0 && <EmptyTrashButton count={stats.trash} />}
          </section>
        )}

        {lockedAway && current ? (
          /* In the middle of the space beside the sidebar. */
          <div className="flex flex-1 items-center justify-center py-8">
            <LockedFolderScreen folderId={current.id} name={current.name} icon={current.icon} />
          </div>
        ) : (
          /* Keyed by the filters, so moving to another page or view starts a fresh selection. */
          <SelectionProvider
            key={JSON.stringify(filters)}
            items={selectable}
            mode={inTrash ? "trash" : "library"}
            hasMorePages={pages > 1}
          >
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <form action="/" className="relative flex min-w-48 flex-1" role="search">
                {filters.collection && <input type="hidden" name="collection" value={filters.collection} />}
                {!filters.collection && filters.scope !== "all" && (
                  <input type="hidden" name="filter" value={filters.scope} />
                )}
                {filters.tag && <input type="hidden" name="tag" value={filters.tag} />}
                {filters.view !== "grid" && <input type="hidden" name="view" value={filters.view} />}
                <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
                <input
                  type="search"
                  name="q"
                  defaultValue={filters.q}
                  placeholder='Search… try "exact phrase", -word, #tag'
                  aria-label="Search links"
                  className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface pr-3 pl-9 text-sm transition-colors outline-none placeholder:text-muted/80 focus:border-brand/50 focus:ring-3 focus:ring-brand/15"
                />
              </form>
              <div className="flex h-9 items-center rounded-lg bg-subtle p-0.5" role="group" aria-label="Layout">
                {(["grid", "list"] as const).map((view) => {
                  const active = filters.view === view;
                  const label = view === "grid" ? "Grid" : "List";
                  return (
                    <Link
                      key={view}
                      href={hrefFor(filters, { view, page: 1 })}
                      aria-current={active ? "page" : undefined}
                      title={label}
                      aria-label={label}
                      className={`grid h-8 w-9 place-items-center rounded-md transition-colors ${
                        active ? "bg-surface text-ink shadow-xs" : "text-muted hover:text-ink"
                      }`}
                    >
                      {view === "grid" ? <GridIcon className="size-4" /> : <ListIcon className="size-4" />}
                    </Link>
                  );
                })}
              </div>
              {filters.view === "grid" && <GridColumnsToggle columns={gridColumns} />}
              <ImagesToggle hidden={hideImages} />
              {selectable.length > 0 && <SelectModeToggle />}
            </div>

            {error && (
              <p className="mb-6 rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
                Could not load your links: {error}. Have you run every SQL migration in supabase/migrations?
              </p>
            )}

            {links.length > 0 ? (
              filters.view === "list" ? (
                <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
                  {links.map((link) => (
                    <LinkRow
                      key={link.id}
                      link={link}
                      hideImages={hideImages}
                      collection={filters.collection ? null : byId.get(link.collection_id ?? "")}
                    />
                  ))}
                </ul>
              ) : (
                <div className={`grid gap-4 ${GRID_COLUMNS[gridColumns]}`}>
                  {links.map((link) => (
                    <LinkCard
                      key={link.id}
                      link={link}
                      hideImages={hideImages}
                      collection={filters.collection ? null : byId.get(link.collection_id ?? "")}
                    />
                  ))}
                </div>
              )
            ) : (
              !error && (
                <div className="flex flex-col items-center rounded-xl border border-dashed border-line px-6 py-14 text-center">
                  <span className="mb-3 grid size-11 place-items-center rounded-full bg-subtle text-muted">
                    {inTrash ? <TrashIcon className="size-5" /> : filters.q || filters.tag ? <SearchIcon className="size-5" /> : <LayersIcon className="size-5" />}
                  </span>
                  <p className="text-sm font-medium text-ink">
                    {filters.q || filters.tag
                      ? "Nothing matches"
                      : inTrash
                        ? "The Trash is empty"
                        : stats.total + stats.archived === 0
                          ? "No links yet"
                          : "Nothing here yet"}
                  </p>
                  <p className="mt-1 max-w-sm text-sm text-muted">
                    {filters.q || filters.tag ? (
                      "Try other words or clear the filters."
                    ) : inTrash ? (
                      "Links you delete wait here for a week."
                    ) : stats.total + stats.archived === 0 ? (
                      <>
                        Paste a link above, or{" "}
                        <Link href="/import-export" className="font-medium text-brand hover:underline">
                          import your browser bookmarks
                        </Link>
                        .
                      </>
                    ) : (
                      "Links you save here will show up in this list."
                    )}
                  </p>
                </div>
              )
            )}

            {pages > 1 && (
              <nav className="mt-8 flex items-center justify-center gap-2 text-sm" aria-label="Pagination">
                {filters.page > 1 && (
                  <Link
                    href={hrefFor(filters, { page: filters.page - 1 })}
                    className="rounded-lg border border-line bg-surface px-3 py-1.5 transition-colors hover:bg-subtle"
                  >
                    ← Newer
                  </Link>
                )}
                <span className="px-2 text-muted tabular-nums">
                  Page {filters.page} of {pages}
                </span>
                {filters.page < pages && (
                  <Link
                    href={hrefFor(filters, { page: filters.page + 1 })}
                    className="rounded-lg border border-line bg-surface px-3 py-1.5 transition-colors hover:bg-subtle"
                  >
                    Older →
                  </Link>
                )}
              </nav>
            )}
          </SelectionProvider>
        )}
      </main>
    </Frame>
  );
}

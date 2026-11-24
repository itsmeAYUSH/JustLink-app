import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "@/app/actions";
import { readFilters, sectionHref, type Filters } from "@/lib/filters";
import type { Collection, LibraryStats } from "@/lib/links";
import { shortName, type Profile } from "@/lib/profile";
import { Avatar } from "./avatar";
import { FolderMenu } from "./folder-menu";
import { NewFolderButton } from "./folders";
import { ArchiveIcon, InboxIcon, LayersIcon, LockIcon, LogOutIcon, StarIcon, TrashIcon } from "./icons";

export type SidebarFolder = Pick<Collection, "id" | "name" | "icon" | "is_public" | "is_locked" | "share_id">;

function Item({
  href,
  active,
  icon,
  label,
  count,
  folderRow = false,
}: {
  href: string;
  active: boolean;
  icon: ReactNode;
  label: string;
  /** A number, or "locked" for a locked folder that isn't open. */
  count?: number | "locked";
  /** A folder, with its ⋯ menu over the right end of the row. */
  folderRow?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`group flex items-center gap-2.5 rounded-lg py-1.5 pl-2.5 text-sm transition-colors ${
        folderRow ? "pr-10 lg:pr-2.5" : "pr-2.5"
      } ${active ? "bg-brand-soft font-medium text-brand-ink" : "text-ink/85 hover:bg-subtle hover:text-ink"}`}
    >
      <span
        className={`grid size-5 shrink-0 place-items-center text-[15px] leading-none ${
          active ? "text-brand" : "text-muted group-hover:text-ink"
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {/* On a large screen the folder's ⋯ button takes the count's place on hover. */}
      <span
        className={`flex items-center ${
          folderRow ? "lg:group-focus-within/row:invisible lg:group-hover/row:invisible" : ""
        }`}
      >
        {count === "locked" ? (
          <LockIcon className="size-3.5 text-muted" aria-label="Locked" />
        ) : (
          count !== undefined && (
            <span className={`text-xs tabular-nums ${active ? "text-brand-ink/70" : "text-muted"}`}>{count}</span>
          )
        )}
      </span>
    </Link>
  );
}

function Heading({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mt-6 mb-1.5 flex items-center justify-between gap-2 pr-1 pl-2.5">
      <h3 className="text-[11px] font-medium tracking-wider text-muted uppercase">{children}</h3>
      {action}
    </div>
  );
}

/**
 * The sidebar's sections, folders (each with a ⋯ menu: rename, share, delete) and tags.
 * Off the library page `filters` is null and nothing is marked as the current section.
 */
export function Sidebar({
  filters,
  stats,
  collections,
  openFolders,
}: {
  filters: Filters | null;
  stats: LibraryStats;
  collections: SidebarFolder[];
  /** Locked folders opened with the PIN for this visit. */
  openFolders: string[];
}) {
  const current = filters ?? readFilters({});
  const inSection = filters !== null && !filters.collection && !filters.tag;
  const icon = "size-4";

  return (
    <nav aria-label="Library" className="text-sm">
      <div className="space-y-0.5">
        <Item href={sectionHref(current, {})} active={inSection && current.scope === "all"} icon={<LayersIcon className={icon} />} label="All links" count={stats.total} />
        <Item href={sectionHref(current, { scope: "favorites" })} active={inSection && current.scope === "favorites"} icon={<StarIcon className={icon} />} label="Favorites" count={stats.favorites} />
        <Item href={sectionHref(current, { scope: "unsorted" })} active={inSection && current.scope === "unsorted"} icon={<InboxIcon className={icon} />} label="No folder" count={stats.unsorted} />
        <Item href={sectionHref(current, { scope: "archived" })} active={inSection && current.scope === "archived"} icon={<ArchiveIcon className={icon} />} label="Archive" count={stats.archived} />
        <Item href={sectionHref(current, { scope: "trash" })} active={inSection && current.scope === "trash"} icon={<TrashIcon className={icon} />} label="Trash" count={stats.trash} />
      </div>

      <Heading action={<NewFolderButton variant="icon" />}>Folders</Heading>
      <div className="space-y-0.5">
        {collections.map((collection) => {
          const locked = collection.is_locked && !openFolders.includes(collection.id);
          return (
            <div key={collection.id} className="group/row relative">
              <Item
                href={sectionHref(current, { collection: collection.id })}
                active={filters?.collection === collection.id}
                icon={collection.icon}
                label={collection.is_public ? `${collection.name} · shared` : collection.name}
                count={locked ? "locked" : (stats.collections[collection.id] ?? 0)}
                folderRow
              />
              <div className="absolute inset-y-0 right-1 flex items-center lg:opacity-0 lg:group-focus-within/row:opacity-100 lg:group-hover/row:opacity-100">
                <FolderMenu
                  variant="row"
                  folder={{
                    id: collection.id,
                    name: collection.name,
                    icon: collection.icon,
                    isPublic: collection.is_public,
                    isLocked: collection.is_locked,
                    shareId: collection.share_id,
                  }}
                  linkCount={locked ? null : (stats.collections[collection.id] ?? 0)}
                  current={filters?.collection === collection.id}
                />
              </div>
            </div>
          );
        })}
        {collections.length === 0 && <NewFolderButton />}
      </div>

      {stats.tags.length > 0 && (
        <>
          <Heading>Tags</Heading>
          <div className="flex flex-wrap gap-1 px-2">
            {stats.tags.slice(0, 40).map(({ tag, count }) => (
              <Link
                key={tag}
                href={sectionHref(current, { tag })}
                className={`rounded-md px-2 py-0.5 text-xs transition-colors ${
                  filters?.tag === tag ? "bg-brand-soft font-medium text-brand-ink" : "text-muted hover:bg-subtle hover:text-ink"
                }`}
              >
                #{tag} <span className="opacity-60">{count}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </nav>
  );
}

/** The bottom of the sidebar: the person's photo (or first initial) and name, and Log out. */
export function SidebarUser({ user }: { user: Profile }) {
  return (
    <div className="space-y-2">
      <Link
        href="/profile"
        title="Your profile"
        className="flex items-center gap-3 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-subtle"
      >
        <Avatar profile={user} size={36} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">{shortName(user)}</span>
          <span className="block truncate text-xs text-muted">Profile &amp; settings</span>
        </span>
      </Link>
      <form action={signOut}>
        <button
          type="submit"
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-subtle hover:text-ink focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-none"
        >
          <LogOutIcon className="size-4" />
          Log out
        </button>
      </form>
    </div>
  );
}

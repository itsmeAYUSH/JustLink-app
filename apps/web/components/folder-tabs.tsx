import Link from "next/link";
import { sectionHref, type Filters } from "@/lib/filters";
import type { Folder } from "@/lib/folders";
import type { LibraryStats } from "@/lib/links";
import { NewFolderButton, QuickStartFolders } from "./folders";

function Tab({
  href,
  active,
  icon,
  label,
  count,
}: {
  href: string;
  active: boolean;
  icon: string;
  label: string;
  /** A number, or 🔒 for a locked folder that isn't open. */
  count: number | "locked";
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900"
          : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-800"
      }`}
    >
      <span aria-hidden="true">{icon}</span>
      {label}
      <span className={`text-xs tabular-nums ${active ? "opacity-70" : "text-zinc-400"}`}>
        {count === "locked" ? <span aria-label="Locked">🔒</span> : count}
      </span>
    </Link>
  );
}

/**
 * Folders as tabs above the links: "All" (every link, in a folder or not), "No folder",
 * then each folder, and a New folder button. Without folders yet, it offers ready-made ones.
 */
export function FolderTabs({
  filters,
  folders,
  stats,
  openFolders,
}: {
  filters: Filters;
  folders: Folder[];
  stats: LibraryStats;
  /** Locked folders opened with the PIN for this visit. */
  openFolders: string[];
}) {
  const unsorted = !filters.collection && filters.scope === "unsorted";
  const all = !filters.collection && filters.scope === "all";

  return (
    <nav aria-label="Folders" className="-mx-1 mb-4 flex items-center gap-2 overflow-x-auto px-1 pb-1">
      <Tab href={sectionHref(filters, {})} active={all} icon="🗂️" label="All" count={stats.total} />
      <Tab
        href={sectionHref(filters, { scope: "unsorted" })}
        active={unsorted}
        icon="📥"
        label="No folder"
        count={stats.unsorted}
      />
      <span aria-hidden="true" className="mx-0.5 h-5 w-px shrink-0 bg-zinc-200 dark:bg-zinc-800" />
      {folders.map((folder) => (
        <Tab
          key={folder.id}
          href={sectionHref(filters, { collection: folder.id })}
          active={filters.collection === folder.id}
          icon={folder.icon}
          label={folder.name}
          count={folder.locked && !openFolders.includes(folder.id) ? "locked" : (stats.collections[folder.id] ?? 0)}
        />
      ))}
      {folders.length === 0 && <QuickStartFolders />}
      <NewFolderButton variant="chip" />
    </nav>
  );
}

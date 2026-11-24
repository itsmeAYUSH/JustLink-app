import Link from "next/link";
import type { ReactNode } from "react";
import { sectionHref, type Filters } from "@/lib/filters";
import type { Collection, LibraryStats } from "@/lib/links";
import { NewCollectionForm } from "./collection-forms";

function Item({
  href,
  active,
  icon,
  label,
  count,
}: {
  href: string;
  active: boolean;
  icon: ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
        active
          ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
          : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
      }`}
    >
      <span className="w-5 text-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && <span className={`text-xs ${active ? "opacity-70" : "text-zinc-400"}`}>{count}</span>}
    </Link>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return <h3 className="mb-1 mt-5 px-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">{children}</h3>;
}

export function Sidebar({
  filters,
  stats,
  collections,
}: {
  filters: Filters;
  stats: LibraryStats;
  collections: Pick<Collection, "id" | "name" | "icon" | "is_public">[];
}) {
  const inSection = !filters.collection && !filters.tag;

  return (
    <nav aria-label="Library" className="text-sm">
      <Item href={sectionHref(filters, {})} active={inSection && filters.scope === "all"} icon="🔗" label="All links" count={stats.total} />
      <Item href={sectionHref(filters, { scope: "favorites" })} active={inSection && filters.scope === "favorites"} icon="★" label="Favorites" count={stats.favorites} />
      <Item href={sectionHref(filters, { scope: "unsorted" })} active={inSection && filters.scope === "unsorted"} icon="📥" label="Unsorted" count={stats.unsorted} />
      <Item href={sectionHref(filters, { scope: "archived" })} active={inSection && filters.scope === "archived"} icon="🗄" label="Archive" count={stats.archived} />

      <Heading>Collections</Heading>
      {collections.map((collection) => (
        <Item
          key={collection.id}
          href={sectionHref(filters, { collection: collection.id })}
          active={filters.collection === collection.id}
          icon={collection.icon}
          label={collection.is_public ? `${collection.name} · shared` : collection.name}
          count={stats.collections[collection.id] ?? 0}
        />
      ))}
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
          <span className="w-5 text-center">＋</span> New collection
        </summary>
        <NewCollectionForm />
      </details>

      {stats.tags.length > 0 && (
        <>
          <Heading>Tags</Heading>
          <div className="flex flex-wrap gap-1 px-2">
            {stats.tags.slice(0, 40).map(({ tag, count }) => (
              <Link
                key={tag}
                href={sectionHref(filters, { tag })}
                className={`rounded-full px-2 py-0.5 text-xs ${
                  filters.tag === tag
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
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

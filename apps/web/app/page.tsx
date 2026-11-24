import { cookies } from "next/headers";
import { LibraryView } from "@/components/library-view";
import { profileFromUser } from "@/lib/profile";
import { parseQuery, readFilters } from "@/lib/filters";
import { LIST_COLUMNS, readStats, trashCutoff } from "@/lib/links";
import { GRID_COLUMNS_COOKIE, HIDE_IMAGES_COOKIE, readGridColumns } from "@/lib/preferences";
import { siteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import { readVaultStatus } from "@/lib/vault";

// Background preview fetching (after()) for imports started from this page may run this long.
export const maxDuration = 300;

const PAGE_SIZE = 48;

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const filters = readFilters(params);
  const prefillUrl = typeof params.url === "string" ? params.url.slice(0, 2000) : "";
  const supabase = await createClient();
  const cookieStore = await cookies();
  const hideImages = cookieStore.get(HIDE_IMAGES_COOKIE)?.value === "1";
  const gridColumns = readGridColumns(cookieStore.get(GRID_COLUMNS_COOKIE)?.value);
  const inTrash = !filters.collection && filters.scope === "trash";
  const [{ data: collectionRows }, { data: vaultJson }] = await Promise.all([
    supabase.from("collections").select("id, name, icon, is_public, is_locked, share_id").order("name"),
    supabase.rpc("vault_status"),
  ]);
  const collections = collectionRows ?? [];
  const byId = new Map(collections.map((collection) => [collection.id, collection]));
  const current = filters.collection ? byId.get(filters.collection) : undefined;
  const vault = readVaultStatus(vaultJson);
  const lockedIds = collections.filter((collection) => collection.is_locked).map((collection) => collection.id);

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
  // Links in locked folders only ever show inside their folder (and only once unlocked).
  if (!filters.collection && lockedIds.length > 0) {
    query = query.or(`collection_id.is.null,collection_id.not.in.(${lockedIds.join(",")})`);
  }

  const search = parseQuery(filters.q);
  for (const tag of [filters.tag, ...search.tags]) {
    if (tag) query = query.contains("tags", [tag]);
  }
  // websearch syntax: "exact phrase", -exclude, or. Ranked by title/tags > description/notes > URL.
  if (search.text) query = query.textSearch("search", search.text, { type: "websearch", config: "english" });

  const [{ data: userData }, { data: links, count, error }, { data: statsJson }] =
    await Promise.all([
      supabase.auth.getUser(),
      query,
      supabase.rpc("get_library_stats"),
      // Deletes this user's links that have been in the Trash for over 7 days. A scheduled
      // job does this hourly where pg_cron is enabled; this covers projects without it.
      supabase.rpc("purge_expired_trash"),
    ]);

  const stats = readStats(statsJson);
  const total = count ?? 0;
  const shareUrl = current?.is_public ? `${await siteUrl()}/s/${current.share_id}` : null;

  return (
    <LibraryView
      user={profileFromUser(userData.user)}
      filters={filters}
      collections={collections}
      vault={vault}
      stats={stats}
      links={links ?? []}
      total={total}
      pages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
      error={error?.message ?? null}
      hideImages={hideImages}
      gridColumns={gridColumns}
      prefillUrl={prefillUrl}
      shareUrl={shareUrl}
    />
  );
}

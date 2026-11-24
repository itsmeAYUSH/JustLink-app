import { MetadataError, normalizeUrl, parseMetadata, urlKey } from "@justlink/metadata";
import { FOLDER_PRESETS, folderKey, type Folder } from "./folders";
import { scrape } from "./library";
import { metadataToColumns } from "./links";
import type { createClient } from "./supabase/server";

/**
 * Saving a link and filing it into a folder, shared by the dashboard's server
 * actions and the browser extension's API, so both behave the same.
 */

type Client = Awaited<ReturnType<typeof createClient>>;

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

/** What a caller gets back about a saved link. */
export const SAVED_LINK_COLUMNS =
  "id, url, title, custom_title, image, favicon, site_name, collection_id, tags, note, fetch_error, deleted_at" as const;

export type SavedLink = {
  id: string;
  url: string;
  title: string | null;
  custom_title: string | null;
  image: string | null;
  favicon: string | null;
  site_name: string | null;
  collection_id: string | null;
  tags: string[];
  note: string | null;
  fetch_error: string | null;
  deleted_at: string | null;
};

/** The user's saved link for this URL (any spelling of it), Trash included; null if none or not a URL. */
export async function findLinkByUrl(supabase: Client, url: string): Promise<SavedLink | null> {
  let key: string;
  try {
    key = urlKey(normalizeUrl(url));
  } catch {
    return null;
  }
  const { data } = await supabase.from("links").select(SAVED_LINK_COLUMNS).eq("url_normalized", key).maybeSingle();
  return data;
}

export type SaveResult =
  | { status: "saved" | "exists" | "restored"; link: SavedLink }
  | { status: "error"; message: string };

/**
 * The page as the user's browser sees it, sent by the extension. Reading it
 * there gets past bot checks and logins that block our own fetch.
 */
export type PageSnapshot = { html: string };

/** Big enough for any page's <head>; the extension sends only that. */
export const MAX_SNAPSHOT_CHARS = 1_000_000;

/** Preview columns from the page the extension read, or null to fetch the page ourselves. */
function columnsFromSnapshot(url: string, page: PageSnapshot) {
  if (!page.html || page.html.length > MAX_SNAPSHOT_CHARS) return null;
  try {
    const parsed = parseMetadata(page.html, url);
    if (!parsed.title) return null;
    return metadataToColumns({ url, finalUrl: url, statusCode: null, contentType: "text/html", ...parsed });
  } catch {
    return null;
  }
}

/**
 * Saves a URL for the signed-in user. A link already saved is returned as is
 * ("exists"); one in the Trash is restored with its notes and tags ("restored").
 */
export async function saveLink(
  supabase: Client,
  userId: string,
  input: { url: string; collectionId?: string | null; page?: PageSnapshot },
): Promise<SaveResult> {
  let url: string;
  let key: string;
  try {
    url = normalizeUrl(input.url);
    key = urlKey(url);
  } catch (error) {
    return { status: "error", message: error instanceof MetadataError ? error.message : "Invalid URL." };
  }

  // Same page, different spelling (http vs https, www, utm_*, trailing slash...)?
  const findExisting = () =>
    supabase.from("links").select(SAVED_LINK_COLUMNS).eq("url_normalized", key).maybeSingle();
  const { data: existing } = await findExisting();
  if (existing?.deleted_at) {
    const { data, error } = await supabase
      .from("links")
      .update({ deleted_at: null })
      .eq("id", existing.id)
      .select(SAVED_LINK_COLUMNS)
      .single();
    if (error) return { status: "error", message: error.message };
    return { status: "restored", link: data };
  }
  if (existing) return { status: "exists", link: existing };

  const columns = (input.page && columnsFromSnapshot(url, input.page)) ?? (await scrape(url));
  const { data, error } = await supabase
    .from("links")
    .insert({ ...columns, url, url_normalized: key, user_id: userId, collection_id: input.collectionId ?? null })
    .select(SAVED_LINK_COLUMNS)
    .single();

  if (error) {
    if (error.code === "23505") {
      // Saved a moment ago by another tab or device…
      const { data: raced } = await findExisting();
      if (raced) return { status: "exists", link: raced };
      // …or saved already, in a locked folder this browser can't see into.
      return { status: "error", message: "This page is already saved, in a locked folder. Enter your PIN to see it." };
    }
    if (error.code === "42501") {
      return { status: "error", message: "That folder is locked. Enter your PIN, then save again." };
    }
    return { status: "error", message: error.message };
  }
  return { status: "saved", link: data };
}

/**
 * The folder links should go into: an existing one by id (null or "" = no folder),
 * or one named `newFolderName`, created unless a folder with that name exists.
 */
export async function resolveFolder(
  supabase: Client,
  userId: string,
  target: { folderId?: string | null; newFolderName?: string | null },
): Promise<{ folder: Folder | null } | { error: string }> {
  const newName = (target.newFolderName ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
  if (newName) {
    const { data: folders } = await supabase.from("collections").select("id, name, icon");
    const match = folders?.find((item) => folderKey(item.name) === folderKey(newName));
    if (match) return { folder: match };
    const preset = FOLDER_PRESETS.find((item) => folderKey(item.name) === folderKey(newName));
    const { data, error } = await supabase
      .from("collections")
      .insert({ name: newName, icon: preset?.icon ?? "📁", user_id: userId })
      .select("id, name, icon")
      .single();
    if (error) return { error: `Couldn't create the folder: ${error.message}` };
    return { folder: data };
  }

  const id = target.folderId ?? "";
  if (!id) return { folder: null };
  const { data } = UUID.test(id)
    ? await supabase.from("collections").select("id, name, icon").eq("id", id).maybeSingle()
    : { data: null };
  if (!data) return { error: "That folder can't be found. Reload and try again." };
  return { folder: data };
}

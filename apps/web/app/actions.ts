"use server";

import { MetadataError, normalizeUrl, parseBookmarkFile, urlKey } from "@justlink/metadata";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { processPendingLinks, scrape } from "@/lib/library";
import { displayTitle, parseTags } from "@/lib/links";
import { FOLDER_PRESETS, folderKey, type Folder } from "@/lib/folders";
import { extractUrls, MAX_LINKS_PER_PASTE } from "@/lib/paste";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

function str(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/** An optional collection id from a <select>; "" or anything malformed means "no collection". */
function collectionId(formData: FormData): string | null {
  const value = str(formData, "collection_id");
  return UUID.test(value) ? value : null;
}

function refresh(linkId?: string) {
  revalidatePath("/");
  if (linkId) revalidatePath(`/links/${linkId}`);
}

// ─── Links ──────────────────────────────────────────────────────────────────

export type AddLinkState = {
  status: "idle" | "success" | "error";
  message?: string;
  /** Echoed back on error so the input keeps what the user typed. */
  url?: string;
  /** Set when the URL was already saved, so the form can link to it. */
  existingId?: string;
};

/** Saves the link in the "url" field, or every link in it when several were pasted. */
export async function addLink(_prev: AddLinkState, formData: FormData): Promise<AddLinkState> {
  const raw = str(formData, "url");
  const { urls } = extractUrls(raw);
  if (urls.length > 1) return addManyLinks(raw, urls, formData);

  let url: string;
  let key: string;
  try {
    // Words around a single link ("read this: https://…") are ignored.
    url = normalizeUrl(urls[0] ?? raw);
    key = urlKey(url);
  } catch (error) {
    return {
      status: "error",
      message: error instanceof MetadataError ? error.message : "Invalid URL.",
      url: raw,
    };
  }

  const { supabase, user } = await requireUser();

  // Same page, different spelling (http vs https, www, utm_*, trailing slash...)?
  const { data: existing } = await supabase
    .from("links")
    .select("id, title, url, deleted_at")
    .eq("url_normalized", key)
    .maybeSingle();
  if (existing?.deleted_at) {
    // Saving it again means they want it back: restore it, notes and tags included.
    const { error } = await supabase.from("links").update({ deleted_at: null }).eq("id", existing.id);
    if (error) return { status: "error", message: error.message, url: raw };
    refresh(existing.id);
    return { status: "success", message: `Restored “${displayTitle(existing)}” from the Trash` };
  }
  if (existing) {
    return { status: "error", message: "You've already saved this link.", url: raw, existingId: existing.id };
  }

  const columns = await scrape(url);
  const { data: link, error } = await supabase
    .from("links")
    .insert({ ...columns, url, url_normalized: key, user_id: user.id, collection_id: collectionId(formData) })
    .select("title, url, fetch_error")
    .single();

  if (error) {
    const message = error.code === "23505" ? "You've already saved this link." : error.message;
    return { status: "error", message, url: raw };
  }

  refresh();
  return {
    status: "success",
    message: link.fetch_error
      ? `Saved, but no preview: ${link.fetch_error}`
      : `Saved “${displayTitle(link)}”`,
  };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Several pasted links: each is saved as its own link right away, and the previews
 * are fetched in the background (like an import). Links already saved are skipped;
 * ones in the Trash are restored.
 */
async function addManyLinks(raw: string, candidates: string[], formData: FormData): Promise<AddLinkState> {
  if (candidates.length > MAX_LINKS_PER_PASTE) {
    return {
      status: "error",
      message: `That's ${candidates.length} links. Paste up to ${MAX_LINKS_PER_PASTE} at a time, or use Import / Export for longer lists.`,
      url: raw,
    };
  }

  const links: { url: string; key: string }[] = [];
  const keys = new Set<string>();
  let invalid = 0;
  for (const candidate of candidates) {
    try {
      const url = normalizeUrl(candidate);
      const key = urlKey(url);
      if (keys.has(key)) continue; // The same page twice in one paste.
      keys.add(key);
      links.push({ url, key });
    } catch {
      invalid++;
    }
  }
  if (links.length === 0) return { status: "error", message: "None of those are links that can be saved.", url: raw };

  const { supabase, user } = await requireUser();

  // Which are saved already, perhaps in the Trash? In chunks, to keep request URLs short.
  const existing = new Map<string, { id: string; deleted_at: string | null }>();
  for (let i = 0; i < links.length; i += 50) {
    const { data, error } = await supabase
      .from("links")
      .select("id, url_normalized, deleted_at")
      .in(
        "url_normalized",
        links.slice(i, i + 50).map((link) => link.key),
      );
    if (error) return { status: "error", message: error.message, url: raw };
    for (const row of data) existing.set(row.url_normalized, row);
  }

  // Pasting a link that's in the Trash means they want it back.
  const trashedIds = [...existing.values()].filter((row) => row.deleted_at).map((row) => row.id);
  if (trashedIds.length) {
    const { error } = await supabase.from("links").update({ deleted_at: null }).in("id", trashedIds);
    if (error) return { status: "error", message: error.message, url: raw };
  }

  const fresh = links.filter((link) => !existing.has(link.key));
  const collection = collectionId(formData);
  const now = Date.now();
  let saved = 0;
  if (fresh.length) {
    const { data, error } = await supabase
      .from("links")
      .upsert(
        fresh.map((link, index) => ({
          user_id: user.id,
          url: link.url,
          url_normalized: link.key,
          collection_id: collection,
          fetch_status: "pending" as const,
          // A millisecond apart, first pasted newest, so the library lists them in the pasted order.
          created_at: new Date(now - index).toISOString(),
        })),
        { onConflict: "user_id,url_normalized", ignoreDuplicates: true },
      )
      .select("id");
    if (error) return { status: "error", message: error.message, url: raw };
    saved = data.length;
    if (saved) after(() => processPendingLinks(supabase));
  }
  refresh();

  const restored = trashedIds.length;
  const alreadySaved = links.length - saved - restored;
  const parts = [
    saved && `Saved ${plural(saved, "link")}`,
    restored && `restored ${restored} from the Trash`,
    alreadySaved && `${alreadySaved} already saved`,
    invalid && `skipped ${plural(invalid, "invalid link")}`,
  ].filter((part): part is string => Boolean(part));
  const summary = parts.join(" · ");
  const message = `${summary.charAt(0).toUpperCase()}${summary.slice(1)}.${saved ? " Previews are loading." : ""}`;

  if (!saved && !restored) {
    const allSaved = links.length === 1 ? "That link is already saved." : `All ${links.length} links are already saved.`;
    return { status: "error", message: alreadySaved === links.length ? allSaved : message };
  }
  return { status: "success", message };
}

export type UpdateLinkState = { status: "idle" | "success" | "error"; message?: string };

/** Saves the user's own title, description, note, tags and collection. Scraped fields stay untouched. */
export async function updateLink(_prev: UpdateLinkState, formData: FormData): Promise<UpdateLinkState> {
  const id = str(formData, "id");
  const { supabase } = await requireUser();

  const { data: link } = await supabase.from("links").select("title, description").eq("id", id).maybeSingle();
  if (!link) return { status: "error", message: "Link not found." };

  const title = str(formData, "custom_title");
  const description = str(formData, "custom_description");
  const note = str(formData, "note");

  const { error } = await supabase
    .from("links")
    .update({
      // Only store an override when it differs from what the page says.
      custom_title: title && title !== link.title ? title.slice(0, 500) : null,
      custom_description: description && description !== link.description ? description.slice(0, 5000) : null,
      note: note ? note.slice(0, 10_000) : null,
      tags: parseTags(str(formData, "tags")),
      collection_id: collectionId(formData),
    })
    .eq("id", id);

  if (error) return { status: "error", message: error.message };
  refresh(id);
  return { status: "success", message: "Saved." };
}

export async function setFavorite(formData: FormData): Promise<void> {
  const id = str(formData, "id");
  const { supabase } = await requireUser();
  await supabase.from("links").update({ is_favorite: str(formData, "value") === "true" }).eq("id", id);
  refresh(id);
}

export async function setArchived(formData: FormData): Promise<void> {
  const id = str(formData, "id");
  const { supabase } = await requireUser();
  await supabase.from("links").update({ is_archived: str(formData, "value") === "true" }).eq("id", id);
  refresh(id);
}

export async function refreshLink(formData: FormData): Promise<void> {
  const id = str(formData, "id");
  const { supabase } = await requireUser();

  const { data: link } = await supabase.from("links").select("url, title, description").eq("id", id).maybeSingle();
  if (!link) return;

  await supabase.from("links").update(await scrape(link.url, link)).eq("id", id);
  refresh(id);
}

// ─── Trash ──────────────────────────────────────────────────────────────────
// Deleting moves links to the Trash (deleted_at is set). They can be restored
// for 7 days; after that purge_expired_trash() deletes them for good.

/** The result of an action on several links; `count` is how many it changed. */
export type LinksActionState = { error?: string; count?: number } | null;

/** The most links one action takes: more than a page of the dashboard, small enough for one query. */
const MAX_BULK = 500;

/** The link ids sent as "id" fields, or an error message. */
function linkIds(formData: FormData): string[] | { error: string } {
  const ids = [
    ...new Set(formData.getAll("id").filter((value): value is string => typeof value === "string" && UUID.test(value))),
  ];
  if (ids.length === 0) return { error: "Select at least one link." };
  if (ids.length > MAX_BULK) return { error: `Choose at most ${MAX_BULK} links at a time.` };
  return ids;
}

/** Moves links to the Trash. Everything on them is kept, so they can be restored. */
export async function trashLinks(_prev: LinksActionState, formData: FormData): Promise<LinksActionState> {
  const ids = linkIds(formData);
  if (!Array.isArray(ids)) return ids;
  const { supabase } = await requireUser();

  // Row Level Security limits this to the signed-in user's own rows.
  const { error, count } = await supabase
    .from("links")
    .update({ deleted_at: new Date().toISOString() }, { count: "exact" })
    .in("id", ids)
    .is("deleted_at", null);
  if (error) return { error: `Couldn't move ${ids.length === 1 ? "this link" : "these links"} to the Trash: ${error.message}` };

  refresh();
  for (const id of ids) revalidatePath(`/links/${id}`);
  return { count: count ?? ids.length };
}

/** For the link's own page: moves it to the Trash and goes back to the library. */
export async function trashLinkAndGoHome(formData: FormData): Promise<void> {
  const result = await trashLinks(null, formData);
  if (!result?.error) redirect("/");
}

export async function restoreLinks(_prev: LinksActionState, formData: FormData): Promise<LinksActionState> {
  const ids = linkIds(formData);
  if (!Array.isArray(ids)) return ids;
  const { supabase } = await requireUser();

  const { error, count } = await supabase
    .from("links")
    .update({ deleted_at: null }, { count: "exact" })
    .in("id", ids)
    .not("deleted_at", "is", null);
  if (error) return { error: `Couldn't restore ${ids.length === 1 ? "this link" : "these links"}: ${error.message}` };

  refresh();
  for (const id of ids) revalidatePath(`/links/${id}`);
  return { count: count ?? ids.length };
}

/** For the link's own page: a plain form that restores it and stays. */
export async function restoreLink(formData: FormData): Promise<void> {
  await restoreLinks(null, formData);
}

/** Deletes links for good. Only links already in the Trash, so nothing skips the 7-day safety net by accident. */
export async function deleteLinksForever(_prev: LinksActionState, formData: FormData): Promise<LinksActionState> {
  const ids = linkIds(formData);
  if (!Array.isArray(ids)) return ids;
  const { supabase } = await requireUser();

  const { error, count } = await supabase
    .from("links")
    .delete({ count: "exact" })
    .in("id", ids)
    .not("deleted_at", "is", null);
  if (error) return { error: `Couldn't delete ${ids.length === 1 ? "this link" : "these links"}: ${error.message}` };

  refresh();
  if (formData.get("redirect") === "trash") redirect("/?filter=trash");
  return { count: count ?? ids.length };
}

/** Deletes everything in the Trash for good. */
export async function emptyTrash(): Promise<LinksActionState> {
  const { supabase } = await requireUser();
  const { error, count } = await supabase.from("links").delete({ count: "exact" }).not("deleted_at", "is", null);
  if (error) return { error: `Couldn't empty the Trash: ${error.message}` };
  refresh();
  return { count: count ?? 0 };
}

/** Fetches previews for links still marked 'pending' (from an import) in the background. */
export async function fetchPendingPreviews(): Promise<void> {
  const { supabase } = await requireUser();
  after(() => processPendingLinks(supabase));
  refresh();
}

// ─── Folders (the `collections` table) ──────────────────────────────────────

export type CollectionState = { status: "idle" | "success" | "error"; message?: string };

function collectionFields(formData: FormData) {
  const name = str(formData, "name").replace(/\s+/g, " ").slice(0, 60);
  const icon = [...str(formData, "icon")].slice(0, 2).join("") || "📁";
  return { name, icon };
}

export type CreateFoldersState = { status: "idle" | "success" | "error"; message?: string; created?: Folder[] };

/**
 * Creates folders: your own ("name" and "icon" fields) and/or ready-made ones (a "preset"
 * field per folder, by name). Names you already have, in any letter case, are skipped.
 */
export async function createFolders(_prev: CreateFoldersState, formData: FormData): Promise<CreateFoldersState> {
  const wanted = new Map<string, { name: string; icon: string }>();
  const custom = collectionFields(formData);
  if (custom.name) wanted.set(folderKey(custom.name), custom);
  const presets = formData.getAll("preset");
  for (const value of presets) {
    const preset = FOLDER_PRESETS.find((item) => item.name === value);
    if (preset && !wanted.has(folderKey(preset.name))) {
      wanted.set(folderKey(preset.name), { name: preset.name, icon: preset.icon });
    }
  }
  if (wanted.size === 0) return { status: "error", message: "Name your folder, or pick a ready-made one." };

  const { supabase, user } = await requireUser();
  const { data: existing } = await supabase.from("collections").select("name");
  for (const row of existing ?? []) wanted.delete(folderKey(row.name));
  if (wanted.size === 0) {
    return {
      status: "error",
      message: presets.length === 0 ? "You already have a folder with that name." : "You already have those folders.",
    };
  }

  const { data, error } = await supabase
    .from("collections")
    .upsert(
      [...wanted.values()].map((folder) => ({ ...folder, user_id: user.id })),
      { onConflict: "user_id,name", ignoreDuplicates: true },
    )
    .select("id, name, icon");
  if (error) return { status: "error", message: error.message };

  revalidatePath("/");
  const created = data ?? [];
  const [first] = created;
  return {
    status: "success",
    created,
    message: created.length === 1 && first ? `Created ${first.icon} ${first.name}` : `Created ${created.length} folders`,
  };
}

export async function updateCollection(_prev: CollectionState, formData: FormData): Promise<CollectionState> {
  const id = str(formData, "id");
  const { name, icon } = collectionFields(formData);
  if (!name) return { status: "error", message: "Give the folder a name." };

  const { supabase } = await requireUser();
  const { error } = await supabase.from("collections").update({ name, icon }).eq("id", id);
  if (error) {
    return {
      status: "error",
      message: error.code === "23505" ? "You already have a folder with that name." : error.message,
    };
  }
  revalidatePath("/");
  return { status: "success", message: "Saved." };
}

export type MoveLinksState = { error?: string; count?: number; folder?: Folder | null } | null;

/**
 * Moves links into a folder: "folder" is its id ("" for Unsorted), or "new_folder" names
 * a folder to create first (an existing one with that name is reused).
 */
export async function moveLinks(_prev: MoveLinksState, formData: FormData): Promise<MoveLinksState> {
  const ids = linkIds(formData);
  if (!Array.isArray(ids)) return ids;
  const { supabase, user } = await requireUser();

  let folder: Folder | null = null;
  const newName = str(formData, "new_folder").replace(/\s+/g, " ").slice(0, 60);
  if (newName) {
    const { data: folders } = await supabase.from("collections").select("id, name, icon");
    folder = folders?.find((item) => folderKey(item.name) === folderKey(newName)) ?? null;
    if (!folder) {
      const preset = FOLDER_PRESETS.find((item) => folderKey(item.name) === folderKey(newName));
      const { data, error } = await supabase
        .from("collections")
        .insert({ name: newName, icon: preset?.icon ?? "📁", user_id: user.id })
        .select("id, name, icon")
        .single();
      if (error) return { error: `Couldn't create the folder: ${error.message}` };
      folder = data;
    }
  } else {
    const id = str(formData, "folder");
    if (id) {
      const { data } = UUID.test(id)
        ? await supabase.from("collections").select("id, name, icon").eq("id", id).maybeSingle()
        : { data: null };
      if (!data) return { error: "That folder can't be found. Reload the page and try again." };
      folder = data;
    }
  }

  // Row Level Security limits this to the user's own links, and their own folders.
  const { error, count } = await supabase
    .from("links")
    .update({ collection_id: folder?.id ?? null }, { count: "exact" })
    .in("id", ids);
  if (error) return { error: `Couldn't move ${ids.length === 1 ? "this link" : "these links"}: ${error.message}` };

  refresh();
  for (const id of ids) revalidatePath(`/links/${id}`);
  return { count: count ?? ids.length, folder };
}

export async function setCollectionPublic(formData: FormData): Promise<void> {
  const id = str(formData, "id");
  const { supabase } = await requireUser();
  await supabase.from("collections").update({ is_public: str(formData, "value") === "true" }).eq("id", id);
  revalidatePath("/");
}

/** Deletes a collection. Its links are kept and become "Unsorted". */
export async function deleteCollection(formData: FormData): Promise<void> {
  const id = str(formData, "id");
  const { supabase } = await requireUser();
  await supabase.from("collections").delete().eq("id", id);
  revalidatePath("/");
  redirect("/");
}

// ─── Import ─────────────────────────────────────────────────────────────────

export type ImportState = { status: "idle" | "success" | "error"; message?: string };

const MAX_IMPORT_BYTES = 8 * 1024 * 1024;

/**
 * Imports a browser bookmark export (Chrome, Firefox, Safari, Edge, Raindrop,
 * Pocket, linkding...) or a pasted list of URLs. Links are saved right away as
 * 'pending' and their previews are fetched in the background with `after()`.
 */
export async function importBookmarks(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const file = formData.get("file");
  let text = str(formData, "text");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_IMPORT_BYTES) return { status: "error", message: "That file is larger than 8 MB." };
    text = await file.text();
  }
  if (!text) return { status: "error", message: "Choose a bookmarks file or paste some links." };

  const entries = parseBookmarkFile(text);
  if (entries.length === 0) return { status: "error", message: "No http(s) links found in that file." };

  const { supabase, user } = await requireUser();
  const useFolders = formData.get("folders") === "on";

  // Folders become collections (created on demand, matched by name).
  const folderIds = new Map<string, string>();
  if (useFolders) {
    const names = [...new Set(entries.map((entry) => entry.folder?.slice(0, 60)).filter((name): name is string => !!name))];
    if (names.length) {
      const { data: existing } = await supabase.from("collections").select("id, name");
      for (const collection of existing ?? []) folderIds.set(collection.name, collection.id);
      const missing = names.filter((name) => !folderIds.has(name));
      if (missing.length) {
        const { data: created, error } = await supabase
          .from("collections")
          .insert(missing.map((name) => ({ name, user_id: user.id, icon: "📂" })))
          .select("id, name");
        if (error) return { status: "error", message: `Could not create folders: ${error.message}` };
        for (const collection of created ?? []) folderIds.set(collection.name, collection.id);
      }
    }
  }

  const seen = new Set<string>();
  const rows = entries.flatMap((entry) => {
    const key = urlKey(entry.url);
    if (seen.has(key)) return [];
    seen.add(key);
    return [
      {
        user_id: user.id,
        url: entry.url,
        url_normalized: key,
        title: entry.title,
        description: entry.description,
        tags: parseTags(entry.tags),
        collection_id: entry.folder ? (folderIds.get(entry.folder.slice(0, 60)) ?? null) : null,
        fetch_status: "pending" as const,
        // Keep the original save date so the timeline stays meaningful. (Every row
        // needs the same keys: in a bulk insert, missing keys become NULL.)
        created_at: (entry.addedAt ?? new Date()).toISOString(),
      },
    ];
  });

  let imported = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const { data, error } = await supabase
      .from("links")
      .upsert(rows.slice(i, i + 500), { onConflict: "user_id,url_normalized", ignoreDuplicates: true })
      .select("id");
    if (error) return { status: "error", message: `Import stopped after ${imported} links: ${error.message}` };
    imported += data?.length ?? 0;
  }

  if (imported > 0) after(() => processPendingLinks(supabase));
  revalidatePath("/");

  const skipped = rows.length - imported;
  return {
    status: "success",
    message:
      `Imported ${imported} link${imported === 1 ? "" : "s"}` +
      (skipped ? ` (${skipped} already saved)` : "") +
      (imported ? ". Previews are being fetched in the background." : "."),
  };
}

// ─── Auth ───────────────────────────────────────────────────────────────────

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

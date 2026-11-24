"use server";

import { MetadataError, normalizeUrl, parseBookmarkFile, urlKey } from "@justlink/metadata";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { processPendingLinks, scrape } from "@/lib/library";
import { displayTitle, parseTags } from "@/lib/links";
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

export async function addLink(_prev: AddLinkState, formData: FormData): Promise<AddLinkState> {
  const raw = str(formData, "url");

  let url: string;
  let key: string;
  try {
    url = normalizeUrl(raw);
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
    .select("id")
    .eq("url_normalized", key)
    .maybeSingle();
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

export async function deleteLink(formData: FormData): Promise<void> {
  const id = str(formData, "id");
  const { supabase } = await requireUser();

  // Row Level Security limits this to the signed-in user's own rows.
  await supabase.from("links").delete().eq("id", id);

  refresh();
  if (formData.get("redirect") === "home") redirect("/");
}

/** Fetches previews for links still marked 'pending' (from an import) in the background. */
export async function fetchPendingPreviews(): Promise<void> {
  const { supabase } = await requireUser();
  after(() => processPendingLinks(supabase));
  refresh();
}

// ─── Collections ────────────────────────────────────────────────────────────

export type CollectionState = { status: "idle" | "success" | "error"; message?: string };

function collectionFields(formData: FormData) {
  const name = str(formData, "name").replace(/\s+/g, " ").slice(0, 60);
  const icon = [...str(formData, "icon")].slice(0, 2).join("") || "📁";
  return { name, icon };
}

export async function createCollection(_prev: CollectionState, formData: FormData): Promise<CollectionState> {
  const { name, icon } = collectionFields(formData);
  if (!name) return { status: "error", message: "Give the collection a name." };

  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("collections")
    .insert({ name, icon, user_id: user.id })
    .select("id")
    .single();

  if (error) {
    return {
      status: "error",
      message: error.code === "23505" ? "You already have a collection with that name." : error.message,
    };
  }
  revalidatePath("/");
  redirect(`/?collection=${data.id}`);
}

export async function updateCollection(_prev: CollectionState, formData: FormData): Promise<CollectionState> {
  const id = str(formData, "id");
  const { name, icon } = collectionFields(formData);
  if (!name) return { status: "error", message: "Give the collection a name." };

  const { supabase } = await requireUser();
  const { error } = await supabase.from("collections").update({ name, icon }).eq("id", id);
  if (error) {
    return {
      status: "error",
      message: error.code === "23505" ? "You already have a collection with that name." : error.message,
    };
  }
  revalidatePath("/");
  return { status: "success", message: "Saved." };
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
        if (error) return { status: "error", message: `Could not create collections: ${error.message}` };
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

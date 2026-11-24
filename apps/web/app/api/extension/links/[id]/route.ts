import { revalidatePath } from "next/cache";
import { extensionUser, json, linkForExtension, readJsonBody } from "@/lib/extension-api";
import type { Folder } from "@/lib/folders";
import { resolveFolder, SAVED_LINK_COLUMNS } from "@/lib/link-service";
import type { Database } from "@/lib/supabase/database.types";

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

type LinkUpdate = Database["public"]["Tables"]["links"]["Update"];

/**
 * Changes a link just saved from the extension:
 *   { folderId: "<id>" | null }   move it to a folder (null = no folder)
 *   { newFolder: "Reading" }      move it to a new (or same-named) folder
 *   { trashed: true | false }     move it to the Trash, or back (the save card's Undo)
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await extensionUser(request);
  if ("response" in auth) return auth.response;
  const { supabase, user } = auth;

  const { id } = await params;
  if (!UUID.test(id)) return json({ error: "Link not found." }, 404);

  const body = await readJsonBody(request, 10_000);
  if (!body) return json({ error: "Send a JSON body." }, 400);

  const update: LinkUpdate = {};
  let folder: Folder | null = null;
  if ("folderId" in body || "newFolder" in body) {
    const target = await resolveFolder(supabase, user.id, {
      folderId: typeof body.folderId === "string" ? body.folderId : null,
      newFolderName: typeof body.newFolder === "string" ? body.newFolder : null,
    });
    if ("error" in target) return json({ error: target.error }, 400);
    folder = target.folder;
    update.collection_id = target.folder?.id ?? null;
  }
  if (typeof body.trashed === "boolean") update.deleted_at = body.trashed ? new Date().toISOString() : null;
  if (Object.keys(update).length === 0) return json({ error: "Nothing to change." }, 400);

  // Row Level Security limits this to the user's own links and folders.
  const { data, error } = await supabase.from("links").update(update).eq("id", id).select(SAVED_LINK_COLUMNS).maybeSingle();
  if (error) return json({ error: error.message }, 422);
  if (!data) return json({ error: "Link not found." }, 404);

  revalidatePath("/");
  revalidatePath(`/links/${id}`);
  return json({ link: linkForExtension(data), folder });
}

import { revalidatePath } from "next/cache";
import { extensionUser, json, linkForExtension, readJsonBody, userFields } from "@/lib/extension-api";
import {
  findLinkByUrl,
  MAX_SNAPSHOT_CHARS,
  resolveFolder,
  SAVED_LINK_COLUMNS,
  saveLink,
} from "@/lib/link-service";

/** Whether this page is saved already: ?url=… → { link } (null if not), Trash included. */
export async function GET(request: Request) {
  const auth = await extensionUser(request);
  if ("response" in auth) return auth.response;

  const url = new URL(request.url).searchParams.get("url") ?? "";
  const link = await findLinkByUrl(auth.supabase, url);
  return json({ link: link ? linkForExtension(link) : null });
}

/**
 * Saves a page from the extension, with the choices made in its popup:
 *   { url, html?, folderId? | newFolder?, title?, tags?, note? }
 * `html` is the page's <head> as the user's browser sees it; with it we skip fetching
 * the page ourselves, which bot checks and logins often block.
 * A page saved already is updated with those choices (restored if it was in the Trash).
 */
export async function POST(request: Request) {
  const auth = await extensionUser(request);
  if ("response" in auth) return auth.response;
  const { supabase, user } = auth;

  const body = await readJsonBody(request, MAX_SNAPSHOT_CHARS + 30_000);
  if (!body || typeof body.url !== "string") return json({ error: "Send the page's address as `url`." }, 400);

  // The folder: an existing one, a new one by name, or no folder (null). Left out = unchanged.
  const folderChosen = "folderId" in body || "newFolder" in body;
  let collectionId: string | null = null;
  if (folderChosen) {
    const target = await resolveFolder(supabase, user.id, {
      folderId: typeof body.folderId === "string" ? body.folderId : null,
      newFolderName: typeof body.newFolder === "string" ? body.newFolder : null,
    });
    if ("error" in target) return json({ error: target.error }, 400);
    collectionId = target.folder?.id ?? null;
  }

  const result = await saveLink(supabase, user.id, {
    url: body.url,
    collectionId,
    page: typeof body.html === "string" ? { html: body.html } : undefined,
  });
  if (result.status === "error") return json({ error: result.message }, 422);

  // Title, tags and note (and the folder, for a link saved before) as chosen in the popup.
  const changes = {
    ...userFields(body, result.link.title),
    ...(folderChosen && result.status !== "saved" ? { collection_id: collectionId } : {}),
  };
  let link = result.link;
  if (Object.keys(changes).length > 0) {
    const { data, error } = await supabase
      .from("links")
      .update(changes)
      .eq("id", link.id)
      .select(SAVED_LINK_COLUMNS)
      .single();
    if (error) return json({ error: error.message }, 422);
    link = data;
  }

  revalidatePath("/");
  revalidatePath(`/links/${link.id}`);
  return json({ status: result.status, link: linkForExtension(link) });
}

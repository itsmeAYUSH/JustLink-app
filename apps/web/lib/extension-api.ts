import { NextResponse } from "next/server";
import { hostname, parseTags } from "./links";
import type { SavedLink } from "./link-service";
import { createClient } from "./supabase/server";

/**
 * Helpers for /api/extension/*, the endpoints the browser extension calls.
 * The extension sends the user's normal JustLink session cookie (it has host
 * permission for this site), so there is no separate sign-in or token.
 */

/**
 * Every extension request carries this header. A page on another site can't set a
 * custom header on a cross-site request without a CORS preflight, which we never
 * answer, so a forged request can't ride on the session cookie.
 */
export const CLIENT_HEADER = "x-justlink-client";

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

export function fromExtension(request: Request): boolean {
  return request.headers.get(CLIENT_HEADER) === "extension";
}

/** The signed-in user for an extension request, or the response to send instead. */
export async function extensionUser(request: Request) {
  if (!fromExtension(request)) return { response: json({ error: "Not allowed." }, 403) };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { response: json({ error: "Sign in to JustLink first.", signedIn: false }, 401) };
  return { supabase, user };
}

/** A JSON object body of at most `maxChars`, or null. */
export async function readJsonBody(request: Request, maxChars: number): Promise<Record<string, unknown> | null> {
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) return null;
  const text = await request.text();
  if (text.length > maxChars) return null;
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** A saved link as the extension shows it. */
export function linkForExtension(link: SavedLink) {
  return {
    id: link.id,
    url: link.url,
    title: link.custom_title || link.title || hostname(link.url),
    image: link.image,
    favicon: link.favicon,
    siteName: link.site_name ?? hostname(link.url),
    folderId: link.collection_id,
    tags: link.tags,
    note: link.note,
    inTrash: Boolean(link.deleted_at),
    previewError: link.fetch_error,
  };
}

/**
 * The user's own fields sent with a save: { title?, tags?, note? }. Only fields that
 * were sent are returned, so an update never blanks what the popup didn't show.
 */
export function userFields(body: Record<string, unknown>, pageTitle: string | null) {
  const fields: { custom_title?: string | null; tags?: string[]; note?: string | null } = {};
  if (typeof body.title === "string") {
    const title = body.title.replace(/\s+/g, " ").trim().slice(0, 500);
    // Kept only when it differs from the page's own title (like the dashboard's editor).
    fields.custom_title = title && title !== pageTitle ? title : null;
  }
  if (typeof body.tags === "string" || (Array.isArray(body.tags) && body.tags.every((tag) => typeof tag === "string"))) {
    fields.tags = parseTags(body.tags as string | string[]);
  }
  if (typeof body.note === "string") fields.note = body.note.trim().slice(0, 10_000) || null;
  return fields;
}

import { toBookmarkHtml, type BookmarkEntry } from "@justlink/metadata";
import type { NextRequest } from "next/server";
import { APP_SLUG } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";

const EXPORT_COLUMNS =
  "url, title, custom_title, description, custom_description, note, tags, keywords, collection_id, is_favorite, is_archived, image, favicon, site_name, og_type, author, published_time, created_at" as const;

/** Downloads all of the signed-in user's links as a Netscape bookmarks file or JSON. */
export async function GET(request: NextRequest) {
  const format = request.nextUrl.searchParams.get("format") === "json" ? "json" : "html";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { data: collections } = await supabase.from("collections").select("id, name");
  const names = new Map((collections ?? []).map((collection) => [collection.id, collection.name]));

  // Supabase returns at most 1000 rows per request, so page through.
  const links = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("links")
      .select(EXPORT_COLUMNS)
      .order("created_at", { ascending: false })
      .range(from, from + 999);
    if (error) return new Response(error.message, { status: 500 });
    links.push(...data);
    if (data.length < 1000) break;
  }

  const date = new Date().toISOString().slice(0, 10);
  const withCollection = links.map((link) => ({
    ...link,
    collection: link.collection_id ? (names.get(link.collection_id) ?? null) : null,
  }));

  if (format === "json") {
    return new Response(JSON.stringify({ exportedAt: new Date().toISOString(), links: withCollection }, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${APP_SLUG}-${date}.json"`,
      },
    });
  }

  const entries: BookmarkEntry[] = withCollection.map((link) => ({
    url: link.url,
    title: link.custom_title || link.title,
    description: link.note || link.custom_description || link.description,
    tags: link.tags,
    folder: link.collection,
    addedAt: new Date(link.created_at),
  }));

  return new Response(toBookmarkHtml(entries), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `attachment; filename="${APP_SLUG}-bookmarks-${date}.html"`,
    },
  });
}

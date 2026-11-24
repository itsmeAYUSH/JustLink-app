import { fetchMetadata, MetadataError } from "@justlink/metadata";
import { metadataToColumns } from "./links";
import type { createClient } from "./supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * Fetches a URL's metadata and returns the columns to store. Never throws: a
 * failure is recorded in `fetch_error`. `fallback` fills gaps when the page has
 * no title/description of its own (e.g. the title from an imported bookmark).
 */
export async function scrape(
  url: string,
  fallback: { title?: string | null; description?: string | null } = {},
) {
  try {
    const columns = metadataToColumns(await fetchMetadata(url));
    columns.title ??= fallback.title ?? null;
    columns.description ??= fallback.description ?? null;
    return columns;
  } catch (error) {
    return {
      fetch_error:
        error instanceof MetadataError ? error.message : "Could not fetch a preview for this URL.",
      fetch_status: "failed" as const,
      fetched_at: new Date().toISOString(),
    };
  }
}

/**
 * Fetches previews for links still marked 'pending' (from imports), a few at a
 * time, until none are left or the time budget runs out. Run it inside `after()`
 * so the user doesn't wait. Safe to run twice: a link is just fetched again.
 */
export async function processPendingLinks(
  supabase: Client,
  { budgetMs = 250_000, concurrency = 6, batchSize = 60 } = {},
): Promise<number> {
  const deadline = Date.now() + budgetMs;
  let processed = 0;

  while (Date.now() < deadline) {
    const { data: batch } = await supabase
      .from("links")
      .select("id, url, title, description")
      .eq("fetch_status", "pending")
      .order("created_at", { ascending: false })
      .limit(batchSize);
    if (!batch?.length) break;

    let next = 0;
    const worker = async () => {
      while (next < batch.length && Date.now() < deadline) {
        const link = batch[next++]!;
        const columns = await scrape(link.url, link);
        await supabase.from("links").update(columns).eq("id", link.id);
        processed++;
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, batch.length) }, worker));
  }

  return processed;
}

import { readLimited, safeFetch } from "./network.js";
import { parseMetadata } from "./parse.js";
import type { FetchMetadataOptions, LinkMetadata } from "./types.js";
import { normalizeUrl } from "./url.js";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (compatible; JustLinkBot/1.0; link preview fetcher) AppleWebKit/537.36 (KHTML, like Gecko)";

function emptyMetadata(
  url: string,
  finalUrl: string,
  statusCode: number | null,
  contentType: string | null,
): LinkMetadata {
  return {
    url,
    finalUrl,
    canonicalUrl: null,
    statusCode,
    contentType,
    title: null,
    description: null,
    siteName: null,
    type: null,
    image: null,
    imageAlt: null,
    imageWidth: null,
    imageHeight: null,
    favicon: null,
    video: null,
    author: null,
    publishedTime: null,
    modifiedTime: null,
    keywords: [],
    themeColor: null,
    locale: null,
    twitterCard: null,
    twitterSite: null,
    twitterCreator: null,
    metaTags: [],
  };
}

/** Uses the HTTP header charset, then `<meta charset>`, then UTF-8. */
function decodeHtml(bytes: Buffer, contentType: string | null): string {
  const head = bytes.subarray(0, 4096).toString("latin1");
  const charset =
    /charset\s*=\s*["']?([\w.:-]+)/i.exec(contentType ?? "")?.[1] ??
    /<meta[^>]+charset\s*=\s*["']?([\w.:-]+)/i.exec(head)?.[1] ??
    "utf-8";
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function fileNameFromUrl(url: string): string | null {
  const last = new URL(url).pathname.split("/").filter(Boolean).pop();
  if (!last) return null;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

/**
 * Fetches `input` and returns everything we can learn about it.
 * Throws `MetadataError` if the URL is invalid, private, times out or cannot be reached.
 * HTTP error statuses (404, 500, ...) do not throw — check `statusCode`.
 */
export async function fetchMetadata(
  input: string,
  options: FetchMetadataOptions = {},
): Promise<LinkMetadata> {
  const {
    timeoutMs = 10_000,
    maxBytes = 2 * 1024 * 1024,
    maxRedirects = 5,
    userAgent = DEFAULT_USER_AGENT,
  } = options;

  const url = normalizeUrl(input);
  const { response, finalUrl } = await safeFetch(url, {
    headers: {
      "user-agent": userAgent,
      accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(timeoutMs),
    maxRedirects,
  });

  const contentType = response.headers.get("content-type");
  const mime = contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
  const base = emptyMetadata(url, finalUrl, response.status, contentType);
  const origin = new URL(finalUrl).origin;

  // A direct link to an image or a file: nothing to parse, but still useful to show.
  if (mime && !mime.includes("html") && !mime.includes("xml")) {
    await response.body?.cancel().catch(() => {});
    return {
      ...base,
      title: fileNameFromUrl(finalUrl),
      image: mime.startsWith("image/") ? finalUrl : null,
      favicon: `${origin}/favicon.ico`,
    };
  }

  const bytes = await readLimited(response, maxBytes);
  const html = decodeHtml(bytes, contentType);
  return { ...base, ...parseMetadata(html, finalUrl) };
}

import { MetadataError } from "./types.js";

/** Query parameters that only track where a click came from. Removed before saving. */
const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "gclsrc",
  "dclid",
  "gbraid",
  "wbraid",
  "msclkid",
  "yclid",
  "twclid",
  "ttclid",
  "li_fat_id",
  "igshid",
  "igsh",
  "mc_cid",
  "mc_eid",
  "_hsenc",
  "_hsmi",
  "mkt_tok",
  "ref_src",
  "ref_url",
  "si", // YouTube / Spotify share ids
  "spm",
  "vero_id",
  "vero_conv",
  "oly_anon_id",
  "oly_enc_id",
  "rb_clickid",
  "s_cid",
  "_ga",
  "_gl",
]);

function isTrackingParam(name: string): boolean {
  const key = name.toLowerCase();
  return key.startsWith("utm_") || key.startsWith("pk_") || TRACKING_PARAMS.has(key);
}

/** Removes `utm_*`, `fbclid`, `gclid` and similar from a URL object (in place). */
export function stripTrackingParams(url: URL): URL {
  for (const name of [...url.searchParams.keys()]) {
    if (isTrackingParam(name)) url.searchParams.delete(name);
  }
  return url;
}

/**
 * Turns user input into an absolute http(s) URL.
 * Adds `https://` when the scheme is missing, drops the `#fragment` and
 * tracking parameters. Throws `MetadataError("INVALID_URL")` for anything else.
 */
export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new MetadataError("INVALID_URL", "Please enter a URL.");
  }

  const hasScheme = /^[a-z][a-z\d+\-.]*:/i.test(trimmed);
  // "example.com:8080/path" parses as scheme "example.com:" — treat it as a host instead.
  const looksLikeHostWithPort = /^[^/:]+\.[^/:]+:\d+/.test(trimmed);
  const candidate = hasScheme && !looksLikeHostWithPort ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new MetadataError("INVALID_URL", "That doesn't look like a valid URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new MetadataError("INVALID_URL", "Only http and https links can be saved.");
  }
  // A bare word like "hello" would otherwise become https://hello/.
  const isDottedOrSpecialHost =
    url.hostname.includes(".") || url.hostname === "localhost" || url.hostname.startsWith("[");
  if (!url.hostname || !isDottedOrSpecialHost) {
    throw new MetadataError("INVALID_URL", "The URL is missing a valid host name.");
  }
  if (url.username || url.password) {
    throw new MetadataError("INVALID_URL", "URLs with embedded credentials are not allowed.");
  }

  url.hash = "";
  stripTrackingParams(url);
  return url.toString();
}

/**
 * A key for spotting duplicates: two URLs that lead to the same page get the same key.
 * Ignores the scheme, "www.", tracking params, query-param order and a trailing slash.
 *   https://www.Example.com/a/?b=2&a=1&utm_source=x  →  example.com/a?a=1&b=2
 */
export function urlKey(input: string): string {
  const url = new URL(normalizeUrl(input));
  const host = url.host.replace(/^www\./, "");
  const path = url.pathname.replace(/\/+$/, "");
  url.searchParams.sort();
  const query = url.searchParams.toString();
  return `${host}${path}${query ? `?${query}` : ""}`;
}

/**
 * Resolves a possibly-relative URL found in a page against the page URL.
 * Returns `null` unless the result is http(s) — this keeps `javascript:` and
 * `data:` URLs out of anything we later render as a link or image.
 */
export function resolveHttpUrl(value: string | null | undefined, base: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim(), base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

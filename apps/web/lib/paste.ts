/**
 * Finds the links in pasted text, so several can be saved at once:
 *   "https://a.com https://b.com"      separated by spaces
 *   one per line, or "a.com, b.com"    newlines and commas
 *   "https://a.comhttps://b.com"       glued together (e.g. a browser input dropped the newlines)
 *   "Read this: https://a.com!"        surrounded by words and punctuation
 * Dependency-free, so the add-link box can count links as you type and the server can save them.
 * The server still checks each one with normalizeUrl().
 */

/** The most links one paste saves. Bigger lists belong on the Import page. */
export const MAX_LINKS_PER_PASTE = 200;

const SCHEME = /^https?:\/\/\S/i;
/** "github.com/vercel/next.js", "www.example.co.uk:8080/path?q=1" */
const BARE_DOMAIN = /^(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+[a-z]{2,}(?::\d{1,5})?(?:[/?#]\S*)?$/i;

function count(text: string, char: string): number {
  return text.split(char).length - 1;
}

/** Drops quotes, brackets and sentence punctuation around a link, but keeps "(...)" inside it. */
function trimPunctuation(token: string): string {
  let result = token.replace(/^[<(["'`]+/, "").replace(/[>"'`.,;:!?]+$/, "");
  // Wikipedia-style links end in ")": only strip closing brackets with no partner in the link.
  for (const [open, close] of [
    ["(", ")"],
    ["[", "]"],
  ] as const) {
    while (result.endsWith(close) && count(result, open) < count(result, close)) {
      result = result.slice(0, -1).replace(/[.,;:!?]+$/, "");
    }
  }
  return result;
}

export function extractUrls(text: string): { urls: string[]; duplicates: number } {
  const tokens = text
    // "https://a.comhttps://b.com" → two links. Only after a letter, digit or bracket, so
    // "web.archive.org/web/2024/https://x.com" and "?next=https://x.com" stay whole.
    .replace(/([a-z\d)\]])(https?:\/\/)/gi, "$1 $2")
    .split(/\s+/)
    // "https://a.com,https://b.com" (a comma in the middle of one link stays).
    .flatMap((token) => token.split(/[,;|](?=https?:\/\/|www\.)/i))
    .map(trimPunctuation)
    .filter(Boolean);

  // In text that has full links, a bare "Next.js" or "e.g." is a word, not a site.
  const hasFullLinks = tokens.some((token) => SCHEME.test(token));
  const looksLikeLink = (token: string) =>
    SCHEME.test(token) || (BARE_DOMAIN.test(token) && (!hasFullLinks || /^www\./i.test(token)));

  const urls: string[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  for (const token of tokens) {
    if (!looksLikeLink(token)) continue;
    // A rough key; the server dedupes properly with urlKey().
    const key = token
      .toLowerCase()
      .replace(/^https?:\/\/(www\.)?/, "")
      .replace(/^www\./, "")
      .replace(/\/+$/, "");
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    urls.push(token);
  }
  return { urls, duplicates };
}

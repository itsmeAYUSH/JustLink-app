import { load, type CheerioAPI } from "cheerio";
import type { LinkMetadata, MetaTag } from "./types.js";
import { resolveHttpUrl } from "./url.js";

export type ParsedMetadata = Omit<LinkMetadata, "url" | "finalUrl" | "statusCode" | "contentType">;

const MAX_META_TAGS = 200;
const MAX_VALUE_LENGTH = 2_000;

/** Collapses whitespace; returns `null` for empty strings. */
function clean(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, MAX_VALUE_LENGTH) : null;
}

function toInt(value: string | null): number | null {
  if (!value) return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function splitList(values: string[]): string[] {
  return values.flatMap((value) => value.split(/[,;]/));
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = clean(raw);
    if (!value || value.length > 100) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out.slice(0, 50);
}

/** Picks the best favicon: an SVG or the largest sized `rel="icon"`, then apple-touch-icon, then /favicon.ico. */
function pickFavicon($: CheerioAPI, pageUrl: string): string | null {
  type Candidate = { href: string; score: number };
  const candidates: Candidate[] = [];

  $("link[rel][href]").each((_, el) => {
    const rel = ($(el).attr("rel") ?? "").toLowerCase().split(/\s+/);
    const href = $(el).attr("href");
    if (!href) return;

    const isIcon = rel.includes("icon");
    const isApple = rel.includes("apple-touch-icon") || rel.includes("apple-touch-icon-precomposed");
    if (!isIcon && !isApple) return;

    const sizes = $(el).attr("sizes") ?? "";
    const size = toInt(sizes.split(/x/i)[0] ?? null) ?? 0;
    const isSvg = ($(el).attr("type") ?? "").includes("svg") || /\.svg(\?|$)/i.test(href);

    let score = isIcon ? 1_000 : 500;
    if (isSvg) score += 300;
    score += Math.min(size, 256);
    candidates.push({ href, score });
  });

  candidates.sort((a, b) => b.score - a.score);
  for (const candidate of candidates) {
    const resolved = resolveHttpUrl(candidate.href, pageUrl);
    if (resolved) return resolved;
  }
  return resolveHttpUrl("/favicon.ico", pageUrl);
}

/** Extracts Open Graph, Twitter card and standard HTML metadata from a page. */
export function parseMetadata(html: string, pageUrl: string): ParsedMetadata {
  const $ = load(html);

  const metaTags: MetaTag[] = [];
  const byKey = new Map<string, string[]>();

  $("meta").each((_, el) => {
    const attrs = $(el);
    const key = clean(
      attrs.attr("property") ?? attrs.attr("name") ?? attrs.attr("itemprop") ?? attrs.attr("http-equiv"),
    );
    const value = clean(attrs.attr("content"));
    if (!key || !value) return;

    if (metaTags.length < MAX_META_TAGS) metaTags.push({ key, value });
    const lower = key.toLowerCase();
    const list = byKey.get(lower);
    if (list) list.push(value);
    else byKey.set(lower, [value]);
  });

  const first = (...keys: string[]): string | null => {
    for (const key of keys) {
      const value = byKey.get(key)?.[0];
      if (value) return value;
    }
    return null;
  };
  const all = (...keys: string[]): string[] => keys.flatMap((key) => byKey.get(key) ?? []);
  const linkHref = (rel: string): string | null =>
    $(`link[rel="${rel}"][href]`).first().attr("href") ?? null;
  const resolve = (value: string | null) => resolveHttpUrl(value, pageUrl);

  return {
    canonicalUrl: resolve(linkHref("canonical") ?? first("og:url")),

    title: first("og:title", "twitter:title") ?? clean($("title").first().text()),
    description: first("og:description", "twitter:description", "description"),
    siteName: first("og:site_name", "application-name", "apple-mobile-web-app-title"),
    type: first("og:type"),

    image: resolve(
      first("og:image", "og:image:url", "og:image:secure_url", "twitter:image", "twitter:image:src") ??
        linkHref("image_src"),
    ),
    imageAlt: first("og:image:alt", "twitter:image:alt"),
    imageWidth: toInt(first("og:image:width")),
    imageHeight: toInt(first("og:image:height")),
    favicon: pickFavicon($, pageUrl),
    video: resolve(first("og:video:secure_url", "og:video:url", "og:video", "twitter:player")),

    author: first("author", "article:author", "book:author", "dc.creator"),
    publishedTime: first("article:published_time", "datepublished", "dc.date", "date"),
    modifiedTime: first("article:modified_time", "og:updated_time", "datemodified"),
    keywords: unique([
      ...splitList(all("keywords", "news_keywords")),
      ...all("article:tag", "video:tag", "book:tag"),
    ]),

    themeColor: first("theme-color", "msapplication-tilecolor"),
    locale: first("og:locale") ?? clean($("html").attr("lang")),
    twitterCard: first("twitter:card"),
    twitterSite: first("twitter:site"),
    twitterCreator: first("twitter:creator"),

    metaTags,
  };
}

import type { LinkMetadata, MetaTag } from "@justlink/metadata";
import type { Database, Json } from "./supabase/database.types";

export type Link = Database["public"]["Tables"]["links"]["Row"];
export type Collection = Database["public"]["Tables"]["collections"]["Row"];
type LinkUpdate = Database["public"]["Tables"]["links"]["Update"];

/** Columns the dashboard needs. Skips the big ones (meta_tags, search vector). */
export const LIST_COLUMNS =
  "id, url, title, custom_title, description, custom_description, image, image_alt, favicon, site_name, og_type, theme_color, keywords, tags, note, is_favorite, is_archived, collection_id, fetch_status, fetch_error, created_at" as const;

export type LinkListItem = Pick<
  Link,
  | "id"
  | "url"
  | "title"
  | "custom_title"
  | "description"
  | "custom_description"
  | "image"
  | "image_alt"
  | "favicon"
  | "site_name"
  | "og_type"
  | "theme_color"
  | "keywords"
  | "tags"
  | "note"
  | "is_favorite"
  | "is_archived"
  | "collection_id"
  | "fetch_status"
  | "fetch_error"
  | "created_at"
>;

/** Maps scraper output onto the `links` table columns. Never touches the user's own fields. */
export function metadataToColumns(meta: LinkMetadata): LinkUpdate {
  return {
    final_url: meta.finalUrl,
    canonical_url: meta.canonicalUrl,
    status_code: meta.statusCode,
    content_type: meta.contentType,
    title: meta.title,
    description: meta.description,
    site_name: meta.siteName,
    og_type: meta.type,
    image: meta.image,
    image_alt: meta.imageAlt,
    image_width: meta.imageWidth,
    image_height: meta.imageHeight,
    favicon: meta.favicon,
    video: meta.video,
    author: meta.author,
    published_time: meta.publishedTime,
    modified_time: meta.modifiedTime,
    keywords: meta.keywords,
    theme_color: meta.themeColor,
    locale: meta.locale,
    twitter_card: meta.twitterCard,
    twitter_site: meta.twitterSite,
    twitter_creator: meta.twitterCreator,
    meta_tags: meta.metaTags as unknown as Json,
    fetch_error: null,
    fetch_status: "done",
    fetched_at: new Date().toISOString(),
  };
}

export function readMetaTags(value: Json): MetaTag[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (tag): tag is { key: string; value: string } =>
      typeof tag === "object" &&
      tag !== null &&
      !Array.isArray(tag) &&
      typeof tag.key === "string" &&
      typeof tag.value === "string",
  );
}

/** "#React, docs,  next.js" → ["React", "docs", "next.js"]: trimmed, no '#', no case-insensitive duplicates. */
export function parseTags(input: string | string[]): string[] {
  const raw = Array.isArray(input) ? input : input.split(",");
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const value of raw) {
    // Braces, quotes, commas and backslashes would break Postgres array filters.
    const tag = value.replace(/^#+/, "").replace(/[{}"\\,]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    tags.push(tag);
  }
  return tags.slice(0, 25);
}

export function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function displayTitle(link: Pick<Link, "title" | "url"> & { custom_title?: string | null }): string {
  return link.custom_title || link.title || hostname(link.url);
}

export function displayDescription(
  link: Pick<Link, "description"> & { custom_description?: string | null },
): string | null {
  return link.custom_description || link.description;
}

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });
const dateTimeFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

/** Formats an ISO date; returns the raw text if it can't be parsed (pages publish all sorts of formats). */
export function formatDate(value: string | null, withTime = false): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return (withTime ? dateTimeFormat : dateFormat).format(date);
}

/** Only allow simple CSS colors from scraped theme-color values. */
export function safeColor(value: string | null): string | null {
  if (!value) return null;
  return /^(#[\da-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\)|[a-z]{3,20})$/i.test(value.trim())
    ? value.trim()
    : null;
}

export type LibraryStats = {
  total: number;
  favorites: number;
  unsorted: number;
  archived: number;
  pending: number;
  collections: Record<string, number>;
  tags: { tag: string; count: number }[];
};

export function readStats(value: Json | null): LibraryStats {
  const stats = (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as Partial<LibraryStats>;
  return {
    total: Number(stats.total ?? 0),
    favorites: Number(stats.favorites ?? 0),
    unsorted: Number(stats.unsorted ?? 0),
    archived: Number(stats.archived ?? 0),
    pending: Number(stats.pending ?? 0),
    collections: stats.collections ?? {},
    tags: Array.isArray(stats.tags) ? stats.tags : [],
  };
}

import { load } from "cheerio";
import { normalizeUrl } from "./url.js";

/** A bookmark read from (or written to) a browser export file. */
export interface BookmarkEntry {
  url: string;
  title: string | null;
  description: string | null;
  tags: string[];
  /** Folder path, e.g. "Dev / React". `null` for bookmarks outside any folder. */
  folder: string | null;
  addedAt: Date | null;
}

const MAX_ENTRIES = 5_000;

/** Top-level folders every browser adds; they carry no meaning, so we skip them. */
const ROOT_FOLDERS = new Set(
  [
    "bookmarks",
    "bookmarks bar",
    "bookmarks toolbar",
    "bookmarks menu",
    "other bookmarks",
    "mobile bookmarks",
    "favorites bar",
    "favourites bar",
    "unsorted bookmarks",
    "imported",
  ].map((name) => name.toLowerCase()),
);

function parseUnixDate(value: string | undefined): Date | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const n = Number(value);
  // Seconds in Netscape files; some tools write milliseconds or microseconds.
  const ms = n > 1e14 ? n / 1000 : n > 1e11 ? n : n * 1000;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date;
}

function cleanUrl(href: string | undefined): string | null {
  if (!href) return null;
  try {
    return normalizeUrl(href);
  } catch {
    return null; // javascript: bookmarklets, chrome://, place:, file:, ...
  }
}

/**
 * Reads a bookmark export. Understands the Netscape bookmark HTML format that
 * Chrome, Edge, Firefox, Safari, Raindrop, Pocket and linkding all export, and
 * falls back to "any http(s) URLs in the text" for plain lists.
 * Invalid and duplicate URLs are dropped.
 */
export function parseBookmarkFile(text: string): BookmarkEntry[] {
  const seen = new Set<string>();
  const entries: BookmarkEntry[] = [];
  const push = (entry: BookmarkEntry) => {
    if (entries.length >= MAX_ENTRIES || seen.has(entry.url)) return;
    seen.add(entry.url);
    entries.push(entry);
  };

  if (/<a\s[^>]*href\s*=/i.test(text)) {
    const $ = load(text);
    $("a[href]").each((_, el) => {
      const anchor = $(el);
      const url = cleanUrl(anchor.attr("href"));
      if (!url) return;

      const folders = anchor
        .parents("dl")
        .toArray()
        .map((dl) => $(dl).prevAll("h3").first().text().trim())
        .filter((name) => name && !ROOT_FOLDERS.has(name.toLowerCase()))
        .reverse();

      const tags = (anchor.attr("tags") ?? "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);

      const description = anchor.parent("dt").next("dd").first().text().trim() || null;

      push({
        url,
        title: anchor.text().replace(/\s+/g, " ").trim() || null,
        description,
        tags,
        folder: folders.length ? folders.join(" / ") : null,
        addedAt: parseUnixDate(anchor.attr("add_date")),
      });
    });
    return entries;
  }

  for (const match of text.matchAll(/https?:\/\/[^\s"'<>()[\]{}]+/gi)) {
    const url = cleanUrl(match[0].replace(/[.,;:!?]+$/, ""));
    if (url) push({ url, title: null, description: null, tags: [], folder: null, addedAt: null });
  }
  return entries;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Writes bookmarks as a Netscape bookmark file, which every browser and bookmark app can import. */
export function toBookmarkHtml(entries: BookmarkEntry[]): string {
  const byFolder = new Map<string, BookmarkEntry[]>();
  for (const entry of entries) {
    const key = entry.folder ?? "";
    const list = byFolder.get(key);
    if (list) list.push(entry);
    else byFolder.set(key, [entry]);
  }

  const line = (entry: BookmarkEntry, indent: string) => {
    const attrs = [`HREF="${escapeHtml(entry.url)}"`];
    if (entry.addedAt) attrs.push(`ADD_DATE="${Math.floor(entry.addedAt.getTime() / 1000)}"`);
    if (entry.tags.length) attrs.push(`TAGS="${escapeHtml(entry.tags.join(","))}"`);
    const out = [`${indent}<DT><A ${attrs.join(" ")}>${escapeHtml(entry.title ?? entry.url)}</A>`];
    if (entry.description) out.push(`${indent}<DD>${escapeHtml(entry.description)}`);
    return out.join("\n");
  };

  const parts = [
    "<!DOCTYPE NETSCAPE-Bookmark-file-1>",
    "<!-- This is an automatically generated file. It will be read and overwritten. DO NOT EDIT! -->",
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    "<TITLE>Bookmarks</TITLE>",
    "<H1>Bookmarks</H1>",
    "<DL><p>",
  ];
  for (const [folder, list] of byFolder) {
    if (!folder) {
      parts.push(...list.map((entry) => line(entry, "    ")));
      continue;
    }
    parts.push(`    <DT><H3>${escapeHtml(folder)}</H3>`, "    <DL><p>");
    parts.push(...list.map((entry) => line(entry, "        ")));
    parts.push("    </DL><p>");
  }
  parts.push("</DL><p>", "");
  return parts.join("\n");
}

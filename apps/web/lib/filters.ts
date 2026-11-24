/**
 * Dashboard state lives in the URL (?filter=favorites&tag=react&q=...&view=list),
 * so every view is linkable, survives reloads and works without client JS.
 */
export type View = "grid" | "list";
export type Scope = "all" | "favorites" | "unsorted" | "archived" | "trash";

export type Filters = {
  scope: Scope;
  collection: string | null;
  tag: string | null;
  q: string;
  view: View;
  page: number;
};

type SearchParams = Record<string, string | string[] | undefined>;

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const SCOPES: Scope[] = ["all", "favorites", "unsorted", "archived", "trash"];

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export function readFilters(params: SearchParams): Filters {
  const scope = first(params.filter) as Scope;
  const collection = first(params.collection);
  const page = Number.parseInt(first(params.page), 10);
  return {
    scope: SCOPES.includes(scope) ? scope : "all",
    collection: UUID.test(collection) ? collection : null,
    tag: first(params.tag).replace(/[{}"\\,]/g, "").slice(0, 40) || null,
    q: first(params.q).slice(0, 200),
    view: first(params.view) === "list" ? "list" : "grid",
    page: Number.isFinite(page) && page > 1 ? page : 1,
  };
}

/** Builds a dashboard URL from the current filters plus changes. */
export function hrefFor(current: Filters, changes: Partial<Filters>): string {
  const next = { ...current, ...changes };
  const params = new URLSearchParams();
  if (next.collection) params.set("collection", next.collection);
  else if (next.scope !== "all") params.set("filter", next.scope);
  if (next.tag) params.set("tag", next.tag);
  if (next.q) params.set("q", next.q);
  if (next.view !== "grid") params.set("view", next.view);
  if (next.page > 1) params.set("page", String(next.page));
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

/** Switching section (scope/collection/tag) starts a fresh search on page 1. */
export function sectionHref(current: Filters, changes: Partial<Filters>): string {
  return hrefFor(current, { scope: "all", collection: null, tag: null, q: "", page: 1, ...changes });
}

/**
 * Splits a search box query into full-text terms and #tags:
 *   'react "server actions" #nextjs -vue'  →  { text: 'react "server actions" -vue', tags: ['nextjs'] }
 */
export function parseQuery(q: string): { text: string; tags: string[] } {
  const tags: string[] = [];
  const text = q
    .replace(/(^|\s)#([^\s#]+)/g, (_, space: string, tag: string) => {
      const clean = tag.replace(/[{}"\\,]/g, "");
      if (clean) tags.push(clean);
      return space;
    })
    .replace(/\s+/g, " ")
    .trim();
  return { text, tags };
}

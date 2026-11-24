import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { LibraryView, type LibraryFolder } from "@/components/library-view";
import { readFilters } from "@/lib/filters";
import type { LibraryStats, LinkListItem } from "@/lib/links";
import { GRID_COLUMNS_COOKIE, readGridColumns } from "@/lib/preferences";

/**
 * Development only: the library screen with sample data, so the design can be
 * checked without signing in. Try ?view=list, ?filter=trash or ?collection=<id>.
 * Buttons that save something do nothing useful here.
 */

const FOLDERS: LibraryFolder[] = [
  { id: "00000000-0000-4000-8000-000000000001", name: "Design", icon: "🎨", is_public: false, is_locked: false, share_id: "a" },
  { id: "00000000-0000-4000-8000-000000000002", name: "Productivity", icon: "⚡", is_public: true, is_locked: false, share_id: "b" },
  { id: "00000000-0000-4000-8000-000000000003", name: "Reading list", icon: "📚", is_public: false, is_locked: false, share_id: "c" },
  { id: "00000000-0000-4000-8000-000000000004", name: "Private", icon: "🔐", is_public: false, is_locked: true, share_id: "d" },
];

/** A soft two-tone picture standing in for a page's preview image. */
function picture(hue: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="hsl(${hue} 22% 86%)"/><circle cx="930" cy="160" r="260" fill="hsl(${hue} 24% 78%)"/><rect x="90" y="380" width="520" height="40" rx="20" fill="hsl(${hue} 20% 70%)"/><rect x="90" y="450" width="340" height="28" rx="14" fill="hsl(${hue} 20% 76%)"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const now = Date.now();
const day = 24 * 60 * 60 * 1000;

function link(n: number, fields: Partial<LinkListItem>): LinkListItem {
  return {
    id: `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    url: "https://example.com/",
    title: "Example page",
    custom_title: null,
    description: null,
    custom_description: null,
    image: null,
    image_alt: null,
    favicon: null,
    site_name: null,
    og_type: null,
    theme_color: null,
    keywords: [],
    tags: [],
    note: null,
    is_favorite: false,
    is_archived: false,
    collection_id: null,
    fetch_status: "done",
    fetch_error: null,
    created_at: new Date(now - n * day).toISOString(),
    deleted_at: null,
    ...fields,
  } as LinkListItem;
}

const LINKS: LinkListItem[] = [
  link(1, {
    url: "https://example.com/color-systems",
    title: "Building calm color systems for interfaces",
    description: "How to pick a small palette that stays easy on the eyes, in light and dark mode, without losing hierarchy.",
    image: picture(160),
    site_name: "Design Notes",
    og_type: "article",
    tags: ["design", "color"],
    is_favorite: true,
    collection_id: FOLDERS[0]!.id,
  }),
  link(2, {
    url: "https://example.org/deep-work",
    title: "A weekly review that actually sticks",
    description: "Thirty minutes every Friday: clear the inbox, look at the calendar, choose three things that matter.",
    image: picture(35),
    site_name: "example.org",
    tags: ["habits"],
    note: "Try this on Friday afternoon.",
    collection_id: FOLDERS[1]!.id,
  }),
  link(3, {
    url: "https://example.net/typography",
    title: "Practical typography for the web",
    description: "Line length, rhythm and contrast: the small choices that make long text comfortable to read.",
    site_name: "example.net",
    og_type: "website",
    keywords: ["fonts", "reading"],
  }),
  link(4, {
    url: "https://example.com/pending",
    title: "example.com/pending",
    fetch_status: "pending",
    collection_id: FOLDERS[2]!.id,
  }),
  link(5, {
    url: "https://example.org/keyboard",
    title: "Keyboard shortcuts worth learning this year",
    description: "A short list of shortcuts that save real time in the browser, the editor and the terminal.",
    image: picture(210),
    site_name: "example.org",
    tags: ["tools", "productivity"],
    is_favorite: true,
  }),
  link(6, {
    url: "https://example.net/blocked",
    title: "example.net/blocked",
    fetch_status: "failed",
    fetch_error: "The site refused automated visits.",
  }),
];

const STATS: LibraryStats = {
  total: 42,
  favorites: 7,
  unsorted: 12,
  archived: 5,
  pending: 0,
  trash: 3,
  collections: { [FOLDERS[0]!.id]: 9, [FOLDERS[1]!.id]: 14, [FOLDERS[2]!.id]: 6, [FOLDERS[3]!.id]: 1 },
  tags: [
    { tag: "design", count: 8 },
    { tag: "productivity", count: 6 },
    { tag: "habits", count: 3 },
    { tag: "tools", count: 3 },
    { tag: "color", count: 2 },
  ],
};

export default async function DesignPreview({ searchParams }: PageProps<"/design">) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const filters = readFilters(params);
  const inTrash = !filters.collection && filters.scope === "trash";
  const empty = params.empty === "1";
  const links = empty
    ? []
    : inTrash
      ? LINKS.slice(0, 3).map((item, index) => ({ ...item, deleted_at: new Date(now - (index + 1) * day).toISOString() }))
      : LINKS;

  return (
    <LibraryView
      user={{ email: "you@example.com", name: "Alex Doe", avatarUrl: null }}
      filters={filters}
      collections={FOLDERS}
      vault={{ hasPin: true, blockedUntil: null, openFolders: [], pinChecked: false }}
      stats={{ ...STATS, pending: params.pending === "1" ? 4 : 0 }}
      links={links}
      total={links.length}
      pages={1}
      error={null}
      hideImages={params.images === "off"}
      gridColumns={readGridColumns((await cookies()).get(GRID_COLUMNS_COOKIE)?.value)}
      prefillUrl=""
      shareUrl={null}
    />
  );
}

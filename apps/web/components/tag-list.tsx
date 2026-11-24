import Link from "next/link";

/**
 * The user's own tags (tinted, clickable filters) followed by keywords scraped from
 * the page (plain, informational), capped at `max` chips.
 */
export function TagList({
  tags,
  keywords = [],
  max = 5,
  size = "sm",
}: {
  tags: string[];
  keywords?: string[];
  max?: number;
  size?: "sm" | "md";
}) {
  const lowerTags = new Set(tags.map((tag) => tag.toLowerCase()));
  const extra = keywords.filter((keyword) => !lowerTags.has(keyword.toLowerCase()));
  const shownTags = tags.slice(0, max);
  const shownKeywords = extra.slice(0, Math.max(0, max - shownTags.length));
  const hidden = tags.length + extra.length - shownTags.length - shownKeywords.length;
  if (shownTags.length + shownKeywords.length === 0) return null;

  const chip = size === "md" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-xs";

  return (
    <ul className="flex flex-wrap gap-1">
      {shownTags.map((tag) => (
        <li key={`t-${tag}`}>
          <Link
            href={`/?tag=${encodeURIComponent(tag)}`}
            className={`relative z-10 inline-block rounded-md bg-brand-soft font-medium text-brand-ink transition-colors hover:bg-brand/15 ${chip}`}
          >
            #{tag}
          </Link>
        </li>
      ))}
      {shownKeywords.map((keyword) => (
        <li
          key={`k-${keyword}`}
          title="Keyword from the page"
          className={`rounded-md bg-subtle text-muted ${chip}`}
        >
          {keyword}
        </li>
      ))}
      {hidden > 0 && <li className="px-1 py-0.5 text-xs text-muted">+{hidden}</li>}
    </ul>
  );
}

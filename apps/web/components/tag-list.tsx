import Link from "next/link";

/**
 * The user's own tags (dark, clickable filters) followed by keywords scraped from
 * the page (light, informational), capped at `max` chips.
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
            className={`relative z-10 inline-block rounded-full bg-zinc-800 text-white hover:bg-zinc-600 dark:bg-zinc-200 dark:text-zinc-900 dark:hover:bg-white ${chip}`}
          >
            #{tag}
          </Link>
        </li>
      ))}
      {shownKeywords.map((keyword) => (
        <li
          key={`k-${keyword}`}
          title="Keyword from the page"
          className={`rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 ${chip}`}
        >
          {keyword}
        </li>
      ))}
      {hidden > 0 && <li className="px-1 py-0.5 text-xs text-zinc-400">+{hidden}</li>}
    </ul>
  );
}

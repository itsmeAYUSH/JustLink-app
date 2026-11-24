import { setArchived, setFavorite } from "@/app/actions";
import type { LinkListItem } from "@/lib/links";

const base =
  "relative z-10 inline-flex size-8 items-center justify-center rounded-md text-base transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800";

/** Star + archive toggles. Plain forms, so they work before (and without) client JS. */
export function LinkActions({
  link,
  className = "",
}: {
  link: Pick<LinkListItem, "id" | "is_favorite" | "is_archived">;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-0.5 ${className}`}>
      <form action={setFavorite}>
        <input type="hidden" name="id" value={link.id} />
        <input type="hidden" name="value" value={String(!link.is_favorite)} />
        <button
          type="submit"
          title={link.is_favorite ? "Remove from favorites" : "Add to favorites"}
          aria-label={link.is_favorite ? "Remove from favorites" : "Add to favorites"}
          aria-pressed={link.is_favorite}
          className={`${base} ${link.is_favorite ? "text-amber-500" : "text-zinc-400 hover:text-amber-500"}`}
        >
          {link.is_favorite ? "★" : "☆"}
        </button>
      </form>
      <form action={setArchived}>
        <input type="hidden" name="id" value={link.id} />
        <input type="hidden" name="value" value={String(!link.is_archived)} />
        <button
          type="submit"
          title={link.is_archived ? "Move back to library" : "Archive"}
          aria-label={link.is_archived ? "Move back to library" : "Archive"}
          className={`${base} text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200`}
        >
          {link.is_archived ? "↩" : "🗄"}
        </button>
      </form>
    </div>
  );
}

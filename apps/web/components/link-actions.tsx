import { setArchived, setFavorite } from "@/app/actions";
import type { LinkListItem } from "@/lib/links";
import { ArchiveIcon, RestoreIcon, StarIcon } from "./icons";

const base =
  "relative z-10 inline-flex size-8 items-center justify-center rounded-md transition-colors hover:bg-subtle focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-none";

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
          className={`${base} ${link.is_favorite ? "text-accent" : "text-muted hover:text-accent"}`}
        >
          <StarIcon className="size-4" fill={link.is_favorite ? "currentColor" : "none"} />
        </button>
      </form>
      <form action={setArchived}>
        <input type="hidden" name="id" value={link.id} />
        <input type="hidden" name="value" value={String(!link.is_archived)} />
        <button
          type="submit"
          title={link.is_archived ? "Move back to library" : "Archive"}
          aria-label={link.is_archived ? "Move back to library" : "Archive"}
          className={`${base} text-muted hover:text-ink`}
        >
          {link.is_archived ? <RestoreIcon className="size-4" /> : <ArchiveIcon className="size-4" />}
        </button>
      </form>
    </div>
  );
}

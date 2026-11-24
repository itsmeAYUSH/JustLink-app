import Link from "next/link";
import {
  displayDescription,
  displayTitle,
  formatDate,
  hostname,
  trashCountdown,
  trashExpiry,
  type Collection,
  type LinkListItem,
} from "@/lib/links";
import { DeleteLinkButton } from "./delete-link-button";
import { FallbackImage } from "./fallback-image";
import { MoveToFolderButton } from "./folders";
import { ExternalLinkIcon, StarIcon } from "./icons";
import { LinkActions } from "./link-actions";
import { RestoreLinkButton, TrashLinkButton } from "./link-trash-buttons";
import { SelectCheckbox, SelectOverlay } from "./selection";
import { TagList } from "./tag-list";

/** Checkboxes stay out of the way until hovered, focused, checked, or the list is in selection mode. */
const checkboxReveal =
  "opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 has-checked:opacity-100 group-data-[selecting]/list:opacity-100";

/** With a mouse, a link's buttons show on hover or focus so the list stays calm; touch screens always show them. */
const quietActions =
  "transition-opacity pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100";

/** Star, archive, Move to folder and Move to Trash; or, for a link in the Trash, Restore and Delete forever. */
function CardActions({ link }: { link: LinkListItem }) {
  const title = displayTitle(link);
  if (link.deleted_at) {
    return (
      <>
        <RestoreLinkButton id={link.id} title={title} />
        <DeleteLinkButton id={link.id} title={title} />
      </>
    );
  }
  return (
    <>
      <LinkActions link={link} />
      <MoveToFolderButton ids={[link.id]} currentFolderId={link.collection_id} />
      <TrashLinkButton id={link.id} title={title} />
    </>
  );
}

/** "Deletes in 3 days", with the exact date on hover. */
function TrashCountdown({ deletedAt, className = "" }: { deletedAt: string; className?: string }) {
  const expiry = trashExpiry(deletedAt);
  return (
    <time
      dateTime={expiry.toISOString()}
      title={`Deleted for good on ${formatDate(expiry.toISOString(), true)}`}
      className={`font-medium text-accent ${className}`}
    >
      {trashCountdown(deletedAt)}
    </time>
  );
}

export function Favicon({ src, className = "size-4" }: { src: string | null; className?: string }) {
  return (
    <FallbackImage
      src={src}
      alt=""
      className={`${className} shrink-0 rounded-sm object-contain`}
      fallback={<span className={`${className} shrink-0 rounded-sm bg-line`} />}
    />
  );
}

/** Shown when a page has no OG image (or it fails to load), or images are off: the favicon and site name. */
export function ImagePlaceholder({
  link,
}: {
  link: Pick<LinkListItem, "favicon" | "theme_color" | "url"> & { fetch_status?: LinkListItem["fetch_status"] };
}) {
  const pending = link.fetch_status === "pending";
  return (
    <div className={`flex size-full items-center justify-center bg-subtle ${pending ? "animate-pulse" : ""}`}>
      <div className="flex flex-col items-center gap-2.5 text-muted">
        <span className="grid size-12 place-items-center rounded-xl bg-surface ring-1 ring-line">
          <Favicon src={link.favicon} className="size-6" />
        </span>
        <span className="text-xs font-medium">{pending ? "Fetching preview…" : hostname(link.url)}</span>
      </div>
    </div>
  );
}

type CardProps = {
  link: LinkListItem;
  collection?: Pick<Collection, "id" | "name" | "icon"> | null;
  /** Show the placeholder (site icon and name) instead of the page's preview image. */
  hideImages?: boolean;
};

export function LinkCard({ link, collection, hideImages = false }: CardProps) {
  const description = displayDescription(link);

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-xl border border-line bg-surface transition-[border-color,box-shadow] hover:border-muted/35 hover:shadow-[0_6px_24px_-12px_rgb(0_0_0/0.18)] has-checked:border-brand has-checked:ring-2 has-checked:ring-brand/20">
      <div
        className={`relative aspect-[1.91/1] overflow-hidden border-b border-line ${link.deleted_at ? "opacity-70 grayscale" : ""}`}
      >
        {hideImages ? (
          <ImagePlaceholder link={link} />
        ) : (
          <FallbackImage
            src={link.image}
            alt={link.image_alt ?? ""}
            className="size-full object-cover"
            fallback={<ImagePlaceholder link={link} />}
          />
        )}
        <div className={`absolute top-1 left-1 z-30 ${checkboxReveal}`}>
          <SelectCheckbox id={link.id} title={displayTitle(link)} />
        </div>
        {link.is_favorite && (
          <span
            title="Favorite"
            className="absolute top-2 right-2 grid size-7 place-items-center rounded-full bg-surface/95 text-accent ring-1 ring-line"
          >
            <StarIcon className="size-3.5" fill="currentColor" />
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 px-4 pt-3.5 pb-3">
        <div className="flex items-center gap-2 text-xs text-muted">
          <Favicon src={link.favicon} />
          <span className="truncate">{link.site_name ?? hostname(link.url)}</span>
          {link.og_type && (
            <span className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-muted uppercase ring-1 ring-line">
              {link.og_type}
            </span>
          )}
        </div>

        <h2 className="line-clamp-2 text-[15px] leading-snug font-semibold text-ink">
          {/* The stretched link makes the whole card clickable. */}
          <Link href={`/links/${link.id}`} className="after:absolute after:inset-0">
            {displayTitle(link)}
          </Link>
        </h2>

        {description && (
          <p className="line-clamp-2 text-sm leading-relaxed text-muted">{description}</p>
        )}

        {link.note && (
          <p className="line-clamp-2 border-l-2 border-line pl-2 text-xs text-muted">
            {link.note}
          </p>
        )}

        {link.fetch_status === "failed" && link.fetch_error && (
          <p className="rounded-md bg-subtle px-2 py-1 text-xs text-muted">
            No preview: {link.fetch_error}
          </p>
        )}

        <TagList tags={link.tags} keywords={link.keywords} max={4} />

        {/* Wraps in narrow cards (5 per row on a laptop): the buttons go under the date. */}
        <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line/70 pt-2.5 text-xs text-muted">
          {link.deleted_at ? (
            <TrashCountdown deletedAt={link.deleted_at} className="truncate" />
          ) : collection ? (
            <Link
              href={`/?collection=${collection.id}`}
              className="relative z-10 -ml-1 truncate rounded-md px-1 py-0.5 transition-colors hover:bg-subtle hover:text-ink"
            >
              {collection.icon} {collection.name}
            </Link>
          ) : (
            <time dateTime={link.created_at}>{formatDate(link.created_at)}</time>
          )}
          <div className="-mr-1.5 ml-auto flex items-center">
            <div className={`flex items-center ${quietActions}`}>
              <CardActions link={link} />
            </div>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              title="Open link"
              aria-label="Open link in a new tab"
              className="relative z-10 inline-flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-subtle hover:text-ink focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-none"
            >
              <ExternalLinkIcon className="size-4" />
            </a>
          </div>
        </div>
      </div>
      <SelectOverlay id={link.id} />
    </article>
  );
}

/** Compact one-line row for the list view. */
export function LinkRow({ link, collection, hideImages = false }: CardProps) {
  const description = displayDescription(link);
  const iconBox = (
    <div className="flex size-full items-center justify-center bg-subtle">
      <Favicon src={link.favicon} className="size-5" />
    </div>
  );
  return (
    <li className="group relative flex items-center gap-3 py-2.5 pr-3 pl-2 transition-colors hover:bg-subtle/60 has-checked:bg-brand-soft/70">
      <div className={`-mr-1 shrink-0 ${checkboxReveal}`}>
        <SelectCheckbox id={link.id} title={displayTitle(link)} />
      </div>
      <div className="hidden h-11 w-18 shrink-0 overflow-hidden rounded-md border border-line sm:block">
        {hideImages ? (
          iconBox
        ) : (
          <FallbackImage src={link.image} alt="" className="size-full object-cover" fallback={iconBox} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Favicon src={link.favicon} />
          <Link href={`/links/${link.id}`} className="truncate font-medium after:absolute after:inset-0">
            {displayTitle(link)}
          </Link>
          {link.is_favorite && <StarIcon className="size-3.5 shrink-0 text-accent" fill="currentColor" aria-label="Favorite" />}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted">
          {hostname(link.url)}
          {collection && ` · ${collection.icon} ${collection.name}`}
          {link.fetch_status === "pending" && " · fetching preview…"}
          {description && ` · ${description}`}
        </p>
        {link.tags.length > 0 && (
          <div className="mt-1">
            <TagList tags={link.tags} max={6} />
          </div>
        )}
      </div>
      {link.deleted_at ? (
        <TrashCountdown deletedAt={link.deleted_at} className="hidden shrink-0 text-xs md:block" />
      ) : (
        <time dateTime={link.created_at} className="hidden shrink-0 text-xs text-muted md:block">
          {formatDate(link.created_at)}
        </time>
      )}
      <div className={`flex shrink-0 items-center gap-0.5 ${quietActions}`}>
        <CardActions link={link} />
      </div>
      <SelectOverlay id={link.id} />
    </li>
  );
}

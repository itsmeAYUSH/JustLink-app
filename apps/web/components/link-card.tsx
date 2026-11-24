import Link from "next/link";
import {
  displayDescription,
  displayTitle,
  formatDate,
  hostname,
  safeColor,
  trashCountdown,
  trashExpiry,
  type Collection,
  type LinkListItem,
} from "@/lib/links";
import { DeleteLinkButton } from "./delete-link-button";
import { FallbackImage } from "./fallback-image";
import { MoveToFolderButton } from "./folders";
import { LinkActions } from "./link-actions";
import { RestoreLinkButton, TrashLinkButton } from "./link-trash-buttons";
import { SelectCheckbox, SelectOverlay } from "./selection";
import { TagList } from "./tag-list";

/** Checkboxes stay out of the way until hovered, focused, checked, or the list is in selection mode. */
const checkboxReveal =
  "opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 has-checked:opacity-100 group-data-[selecting]/list:opacity-100";

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
      className={`font-medium text-amber-600 dark:text-amber-400 ${className}`}
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
      fallback={<span className={`${className} shrink-0 rounded-sm bg-zinc-200 dark:bg-zinc-700`} />}
    />
  );
}

/** Shown when a page has no OG image (or it fails to load): the favicon on the site's theme color. */
export function ImagePlaceholder({
  link,
}: {
  link: Pick<LinkListItem, "favicon" | "theme_color" | "url"> & { fetch_status?: LinkListItem["fetch_status"] };
}) {
  const color = safeColor(link.theme_color);
  const pending = link.fetch_status === "pending";
  return (
    <div
      className={`flex size-full items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-900 ${pending ? "animate-pulse" : ""}`}
      style={color ? { backgroundImage: `linear-gradient(135deg, ${color}33, ${color}66)` } : undefined}
    >
      <div className="flex flex-col items-center gap-2 text-zinc-500 dark:text-zinc-400">
        <Favicon src={link.favicon} className="size-10" />
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
    <article className="group relative flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md has-checked:border-indigo-500 has-checked:ring-2 has-checked:ring-indigo-500/30 dark:border-zinc-800 dark:bg-zinc-900 dark:has-checked:border-indigo-400 dark:has-checked:ring-indigo-400/30">
      <div
        className={`relative aspect-[1.91/1] overflow-hidden border-b border-zinc-100 dark:border-zinc-800 ${link.deleted_at ? "opacity-70 grayscale" : ""}`}
      >
        {hideImages ? (
          <ImagePlaceholder link={link} />
        ) : (
          <FallbackImage
            src={link.image}
            alt={link.image_alt ?? ""}
            className="size-full object-cover transition duration-300 group-hover:scale-[1.02]"
            fallback={<ImagePlaceholder link={link} />}
          />
        )}
        <div className={`absolute top-1 left-1 z-30 ${checkboxReveal}`}>
          <SelectCheckbox id={link.id} title={displayTitle(link)} />
        </div>
        {link.is_favorite && (
          <span className="absolute top-2 right-2 rounded-full bg-white/90 px-2 py-0.5 text-xs text-amber-500 shadow-sm dark:bg-zinc-900/90">
            ★
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Favicon src={link.favicon} />
          <span className="truncate">{link.site_name ?? hostname(link.url)}</span>
          {link.og_type && (
            <span className="ml-auto shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] uppercase text-zinc-500 dark:bg-zinc-800">
              {link.og_type}
            </span>
          )}
        </div>

        <h2 className="line-clamp-2 font-semibold leading-snug">
          {/* The stretched link makes the whole card clickable. */}
          <Link href={`/links/${link.id}`} className="after:absolute after:inset-0">
            {displayTitle(link)}
          </Link>
        </h2>

        {description && (
          <p className="line-clamp-3 text-sm text-zinc-600 dark:text-zinc-400">{description}</p>
        )}

        {link.note && (
          <p className="line-clamp-2 border-l-2 border-amber-300 pl-2 text-xs italic text-zinc-600 dark:border-amber-700 dark:text-zinc-400">
            {link.note}
          </p>
        )}

        {link.fetch_status === "failed" && link.fetch_error && (
          <p className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            No preview: {link.fetch_error}
          </p>
        )}

        <TagList tags={link.tags} keywords={link.keywords} max={4} />

        <div className="mt-auto flex items-center gap-2 pt-2 text-xs text-zinc-400">
          {link.deleted_at ? (
            <TrashCountdown deletedAt={link.deleted_at} className="truncate" />
          ) : collection ? (
            <Link
              href={`/?collection=${collection.id}`}
              className="relative z-10 truncate rounded px-1 py-0.5 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              {collection.icon} {collection.name}
            </Link>
          ) : (
            <time dateTime={link.created_at}>{formatDate(link.created_at)}</time>
          )}
          <div className="ml-auto flex items-center">
            <CardActions link={link} />
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              title="Open link"
              className="relative z-10 rounded px-1.5 py-1 font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
            >
              Visit ↗
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
    <div className="flex size-full items-center justify-center bg-zinc-100 dark:bg-zinc-800">
      <Favicon src={link.favicon} className="size-5" />
    </div>
  );
  return (
    <li className="group relative flex items-center gap-3 py-3 pr-4 pl-2 hover:bg-zinc-50 has-checked:bg-indigo-50/80 dark:hover:bg-zinc-800/50 dark:has-checked:bg-indigo-500/10">
      <div className={`-mr-1 shrink-0 ${checkboxReveal}`}>
        <SelectCheckbox id={link.id} title={displayTitle(link)} />
      </div>
      <div className="hidden h-12 w-20 shrink-0 overflow-hidden rounded-md border border-zinc-100 sm:block dark:border-zinc-800">
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
          {link.is_favorite && <span className="text-xs text-amber-500">★</span>}
        </div>
        <p className="mt-0.5 truncate text-xs text-zinc-500">
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
        <time dateTime={link.created_at} className="hidden shrink-0 text-xs text-zinc-400 md:block">
          {formatDate(link.created_at)}
        </time>
      )}
      <div className="flex shrink-0 items-center gap-0.5">
        <CardActions link={link} />
      </div>
      <SelectOverlay id={link.id} />
    </li>
  );
}

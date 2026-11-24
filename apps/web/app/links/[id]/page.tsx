import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { cache } from "react";
import { refreshLink, restoreLink, trashLinkAndGoHome } from "@/app/actions";
import { AppFrame } from "@/components/app-frame";
import { DeleteLinkButton } from "@/components/delete-link-button";
import { FallbackImage } from "@/components/fallback-image";
import { LinkActions } from "@/components/link-actions";
import { Favicon, ImagePlaceholder } from "@/components/link-card";
import { LinkEditor } from "@/components/link-editor";
import { FolderSession } from "@/components/vault";
import { SubmitButton } from "@/components/submit-button";
import { TagList } from "@/components/tag-list";
import {
  displayDescription,
  displayTitle,
  formatDate,
  hostname,
  readMetaTags,
  safeColor,
  trashCountdown,
  trashExpiry,
} from "@/lib/links";
import { HIDE_IMAGES_COOKIE } from "@/lib/preferences";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

/** Deduped between generateMetadata and the page within one request. */
const getLink = cache(async (id: string) => {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("links").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const { search, ...link } = data; // the tsvector is only for querying
  return link;
});

export async function generateMetadata({ params }: PageProps<"/links/[id]">): Promise<Metadata> {
  const link = await getLink((await params).id);
  return { title: link ? displayTitle(link) : "Link not found" };
}

function ExternalLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="break-all text-brand hover:underline"
    >
      {href}
    </a>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  if (children === null || children === undefined || children === "") return null;
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}

export default async function LinkPage({ params }: PageProps<"/links/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const hideImages = (await cookies()).get(HIDE_IMAGES_COOKIE)?.value === "1";
  const [link, { data: collections }] = await Promise.all([
    getLink(id),
    supabase.from("collections").select("id, name, icon, is_locked").order("name"),
  ]);
  if (!link) notFound();

  const collection = collections?.find((item) => item.id === link.collection_id);
  const description = displayDescription(link);
  const metaTags = readMetaTags(link.meta_tags);
  const themeColor = safeColor(link.theme_color);
  const imageSize =
    link.image_width && link.image_height ? `${link.image_width} × ${link.image_height}` : null;

  return (
    <AppFrame
      header={
        <span className="truncate text-base font-semibold tracking-tight sm:text-lg">
          {link.site_name ?? hostname(link.url)}
        </span>
      }
    >
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 pt-4 pb-8 sm:pt-5">
        {/* A link in a locked folder: this page counts as inside the folder, so it stays open here. */}
        {collection?.is_locked && <FolderSession key={collection.id} folderId={collection.id} />}
        <Link
          href={
            link.deleted_at
              ? "/?filter=trash"
              : collection
                ? `/?collection=${collection.id}`
                : link.is_archived
                  ? "/?filter=archived"
                  : "/"
          }
          className="mb-4 inline-block text-sm text-muted hover:text-ink"
        >
          ←{" "}
          {link.deleted_at
            ? "🗑 Trash"
            : collection
              ? `${collection.icon} ${collection.name}`
              : link.is_archived
                ? "Archive"
                : "All links"}
        </Link>

        {link.deleted_at && (
          <div
            role="status"
            className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-4 text-sm text-muted"
          >
            <p className="min-w-60 flex-1">
              <strong className="font-semibold">This link is in the Trash.</strong> {trashCountdown(link.deleted_at)} (
              {formatDate(trashExpiry(link.deleted_at).toISOString(), true)}). Restore it to keep it.
            </p>
            <form action={restoreLink}>
              <input type="hidden" name="id" value={link.id} />
              <SubmitButton pendingText="Restoring…">Restore</SubmitButton>
            </form>
          </div>
        )}

        <article className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="aspect-[1.91/1] max-h-[420px] w-full overflow-hidden border-b border-line">
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
          </div>

          <div className="space-y-4 p-6">
            <div className="flex items-center gap-2 text-sm text-muted">
              <Favicon src={link.favicon} className="size-5" />
              <span>{link.site_name ?? hostname(link.url)}</span>
              {link.is_archived && (
                <span className="rounded-md bg-subtle px-1.5 py-0.5 text-xs">Archived</span>
              )}
              <LinkActions link={link} className="ml-auto" />
            </div>

            <h1 className="text-2xl font-semibold leading-tight tracking-tight">{displayTitle(link)}</h1>

            {description && <p className="leading-relaxed text-muted">{description}</p>}

            {link.note && (
              <p className="whitespace-pre-line rounded-lg border-l-2 border-brand/50 bg-subtle p-3 text-sm">
                {link.note}
              </p>
            )}

            {link.fetch_status === "pending" && (
              <p className="rounded-lg bg-subtle p-3 text-sm text-muted">
                The preview for this link is still being fetched.
              </p>
            )}

            {link.fetch_status === "failed" && link.fetch_error && (
              <p className="rounded-lg bg-subtle p-3 text-sm text-muted">
                Could not fetch a preview: {link.fetch_error}
              </p>
            )}

            <TagList tags={link.tags} keywords={link.keywords} max={40} size="md" />

            <div className="flex flex-wrap gap-2 pt-2">
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-lg bg-brand px-4 py-2 text-sm font-medium text-on-brand hover:bg-brand/90"
              >
                Visit site ↗
              </a>
              <form action={refreshLink}>
                <input type="hidden" name="id" value={link.id} />
                <SubmitButton variant="secondary" pendingText="Refreshing…">
                  Refresh metadata
                </SubmitButton>
              </form>
              {link.deleted_at ? (
                <DeleteLinkButton id={link.id} title={displayTitle(link)} variant="button" redirectToTrash />
              ) : (
                <form action={trashLinkAndGoHome}>
                  <input type="hidden" name="id" value={link.id} />
                  <SubmitButton variant="danger" pendingText="Moving to Trash…">
                    Move to Trash
                  </SubmitButton>
                </form>
              )}
            </div>
          </div>
        </article>

        <section className="mt-8 rounded-xl border border-line bg-surface p-6">
          <h2 className="mb-4 font-semibold">Edit</h2>
          {/* Pass only what the form needs: the client bundle shouldn't receive meta_tags etc. */}
          <LinkEditor
            link={{
              id: link.id,
              title: link.title,
              description: link.description,
              custom_title: link.custom_title,
              custom_description: link.custom_description,
              note: link.note,
              tags: link.tags,
              keywords: link.keywords,
              collection_id: link.collection_id,
            }}
            collections={collections ?? []}
          />
        </section>

        <section className="mt-8 rounded-xl border border-line bg-surface p-6">
          <h2 className="mb-2 font-semibold">Details</h2>
          <dl className="divide-y divide-line">
            <Row label="URL">
              <ExternalLink href={link.url} />
            </Row>
            <Row label="Title on page">{link.custom_title ? link.title : null}</Row>
            <Row label="Description on page">{link.custom_description ? link.description : null}</Row>
            <Row label="Final URL">
              {link.final_url && link.final_url !== link.url ? <ExternalLink href={link.final_url} /> : null}
            </Row>
            <Row label="Canonical URL">
              {link.canonical_url ? <ExternalLink href={link.canonical_url} /> : null}
            </Row>
            <Row label="Site name">{link.site_name}</Row>
            <Row label="Type (og:type)">{link.og_type}</Row>
            <Row label="Author">{link.author}</Row>
            <Row label="Published">{formatDate(link.published_time, true)}</Row>
            <Row label="Modified">{formatDate(link.modified_time, true)}</Row>
            <Row label="Language">{link.locale}</Row>
            <Row label="Theme color">
              {themeColor ? (
                <span className="inline-flex items-center gap-2">
                  <span
                    className="size-4 rounded border border-line"
                    style={{ backgroundColor: themeColor }}
                  />
                  <code className="font-mono text-xs">{themeColor}</code>
                </span>
              ) : null}
            </Row>
            <Row label="OG image">
              {link.image ? (
                <div className="space-y-1">
                  <ExternalLink href={link.image} />
                  {(imageSize || link.image_alt) && (
                    <p className="text-xs text-muted">
                      {[imageSize, link.image_alt && `alt: “${link.image_alt}”`].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
              ) : null}
            </Row>
            <Row label="Video">{link.video ? <ExternalLink href={link.video} /> : null}</Row>
            <Row label="Favicon">{link.favicon ? <ExternalLink href={link.favicon} /> : null}</Row>
            <Row label="Twitter card">{link.twitter_card}</Row>
            <Row label="Twitter site">{link.twitter_site}</Row>
            <Row label="Twitter creator">{link.twitter_creator}</Row>
            <Row label="Content type">
              {link.content_type ? <code className="font-mono text-xs">{link.content_type}</code> : null}
            </Row>
            <Row label="HTTP status">{link.status_code?.toString()}</Row>
            <Row label="Saved">{formatDate(link.created_at, true)}</Row>
            <Row label="Last fetched">{formatDate(link.fetched_at, true)}</Row>
          </dl>
        </section>

        <section className="mt-8 rounded-xl border border-line bg-surface">
          <details open={metaTags.length <= 30}>
            <summary className="cursor-pointer select-none p-6 font-semibold">
              All meta tags <span className="font-normal text-muted">({metaTags.length})</span>
            </summary>
            {metaTags.length > 0 ? (
              <div className="overflow-x-auto border-t border-line">
                <table className="w-full text-left text-sm">
                  <thead className="bg-subtle text-xs tracking-wide text-muted uppercase">
                    <tr>
                      <th className="px-6 py-2 font-medium">Name / property</th>
                      <th className="px-6 py-2 font-medium">Content</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {metaTags.map((tag, index) => (
                      <tr key={`${tag.key}-${index}`} className="align-top">
                        <td className="whitespace-nowrap px-6 py-2 font-mono text-xs text-muted">{tag.key}</td>
                        <td className="break-all px-6 py-2">{tag.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="border-t border-line px-6 py-4 text-sm text-muted">
                This page has no meta tags.
              </p>
            )}
          </details>
        </section>
      </main>
    </AppFrame>
  );
}

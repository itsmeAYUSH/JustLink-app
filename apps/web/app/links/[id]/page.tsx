import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { cache } from "react";
import { deleteLink, refreshLink } from "@/app/actions";
import { FallbackImage } from "@/components/fallback-image";
import { LinkActions } from "@/components/link-actions";
import { Favicon, ImagePlaceholder } from "@/components/link-card";
import { LinkEditor } from "@/components/link-editor";
import { SiteHeader } from "@/components/site-header";
import { SubmitButton } from "@/components/submit-button";
import { TagList } from "@/components/tag-list";
import { displayDescription, displayTitle, formatDate, hostname, readMetaTags, safeColor } from "@/lib/links";
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
      className="break-all text-blue-600 hover:underline dark:text-blue-400"
    >
      {href}
    </a>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  if (children === null || children === undefined || children === "") return null;
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-sm text-zinc-500">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}

export default async function LinkPage({ params }: PageProps<"/links/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const [link, { data: userData }, { data: collections }] = await Promise.all([
    getLink(id),
    supabase.auth.getUser(),
    supabase.from("collections").select("id, name, icon").order("name"),
  ]);
  if (!link) notFound();

  const collection = collections?.find((item) => item.id === link.collection_id);
  const description = displayDescription(link);
  const metaTags = readMetaTags(link.meta_tags);
  const themeColor = safeColor(link.theme_color);
  const imageSize =
    link.image_width && link.image_height ? `${link.image_width} × ${link.image_height}` : null;

  return (
    <>
      <SiteHeader email={userData.user?.email} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <Link
          href={collection ? `/?collection=${collection.id}` : link.is_archived ? "/?filter=archived" : "/"}
          className="mb-6 inline-block text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
        >
          ← {collection ? `${collection.icon} ${collection.name}` : link.is_archived ? "Archive" : "All links"}
        </Link>

        <article className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="aspect-[1.91/1] max-h-[420px] w-full overflow-hidden border-b border-zinc-100 dark:border-zinc-800">
            <FallbackImage
              src={link.image}
              alt={link.image_alt ?? ""}
              className="size-full object-cover"
              fallback={<ImagePlaceholder link={link} />}
            />
          </div>

          <div className="space-y-4 p-6">
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Favicon src={link.favicon} className="size-5" />
              <span>{link.site_name ?? hostname(link.url)}</span>
              {link.is_archived && (
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800">Archived</span>
              )}
              <LinkActions link={link} className="ml-auto" />
            </div>

            <h1 className="text-2xl font-semibold leading-tight tracking-tight">{displayTitle(link)}</h1>

            {description && <p className="leading-relaxed text-zinc-600 dark:text-zinc-300">{description}</p>}

            {link.note && (
              <p className="whitespace-pre-line rounded-lg border-l-4 border-amber-300 bg-amber-50/60 p-3 text-sm dark:border-amber-700 dark:bg-amber-950/40">
                {link.note}
              </p>
            )}

            {link.fetch_status === "pending" && (
              <p className="rounded-lg bg-sky-50 p-3 text-sm text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                The preview for this link is still being fetched.
              </p>
            )}

            {link.fetch_status === "failed" && link.fetch_error && (
              <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                Could not fetch a preview: {link.fetch_error}
              </p>
            )}

            <TagList tags={link.tags} keywords={link.keywords} max={40} size="md" />

            <div className="flex flex-wrap gap-2 pt-2">
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                Visit site ↗
              </a>
              <form action={refreshLink}>
                <input type="hidden" name="id" value={link.id} />
                <SubmitButton variant="secondary" pendingText="Refreshing…">
                  Refresh metadata
                </SubmitButton>
              </form>
              <form action={deleteLink}>
                <input type="hidden" name="id" value={link.id} />
                <input type="hidden" name="redirect" value="home" />
                <SubmitButton variant="danger" pendingText="Deleting…">
                  Delete
                </SubmitButton>
              </form>
            </div>
          </div>
        </article>

        <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
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

        <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-2 font-semibold">Details</h2>
          <dl className="divide-y divide-zinc-100 dark:divide-zinc-800">
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
                    className="size-4 rounded border border-zinc-300 dark:border-zinc-600"
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
                    <p className="text-xs text-zinc-500">
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

        <section className="mt-8 rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <details open={metaTags.length <= 30}>
            <summary className="cursor-pointer select-none p-6 font-semibold">
              All meta tags <span className="font-normal text-zinc-500">({metaTags.length})</span>
            </summary>
            {metaTags.length > 0 ? (
              <div className="overflow-x-auto border-t border-zinc-100 dark:border-zinc-800">
                <table className="w-full text-left text-sm">
                  <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-950">
                    <tr>
                      <th className="px-6 py-2 font-medium">Name / property</th>
                      <th className="px-6 py-2 font-medium">Content</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {metaTags.map((tag, index) => (
                      <tr key={`${tag.key}-${index}`} className="align-top">
                        <td className="whitespace-nowrap px-6 py-2 font-mono text-xs text-zinc-500">{tag.key}</td>
                        <td className="break-all px-6 py-2">{tag.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="border-t border-zinc-100 px-6 py-4 text-sm text-zinc-500 dark:border-zinc-800">
                This page has no meta tags.
              </p>
            )}
          </details>
        </section>
      </main>
    </>
  );
}

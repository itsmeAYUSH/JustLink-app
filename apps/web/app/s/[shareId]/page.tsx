import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { FallbackImage } from "@/components/fallback-image";
import { Favicon, ImagePlaceholder } from "@/components/link-card";
import { APP_NAME } from "@/lib/brand";
import { hostname } from "@/lib/links";
import { createClient } from "@/lib/supabase/server";

type SharedLink = {
  id: string;
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  image_alt: string | null;
  favicon: string | null;
  site_name: string | null;
  theme_color: string | null;
  tags: string[];
};

type SharedCollection = { name: string; icon: string; links: SharedLink[] };

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

/** Reads a public collection through a security-definer function: no login needed. */
const getShared = cache(async (shareId: string): Promise<SharedCollection | null> => {
  if (!UUID.test(shareId)) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_shared_collection", { p_share_id: shareId });
  return (data as SharedCollection | null) ?? null;
});

export async function generateMetadata({ params }: PageProps<"/s/[shareId]">): Promise<Metadata> {
  const shared = await getShared((await params).shareId);
  if (!shared) return { title: "Folder not found" };
  return {
    title: `${shared.icon} ${shared.name}`,
    description: `${shared.links.length} links shared with ${APP_NAME}`,
  };
}

export default async function SharedCollectionPage({ params }: PageProps<"/s/[shareId]">) {
  const shared = await getShared((await params).shareId);
  if (!shared) notFound();

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
      <header className="mb-8">
        <p className="text-sm text-muted">Shared folder</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {shared.icon} {shared.name}
        </h1>
        <p className="mt-1 text-sm text-muted">{shared.links.length} links</p>
      </header>

      {shared.links.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-12 text-center text-sm text-muted">
          This collection is empty.
        </p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {shared.links.map((link) => (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col overflow-hidden rounded-xl border border-line bg-surface transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="aspect-[1.91/1] overflow-hidden border-b border-line">
                <FallbackImage
                  src={link.image}
                  alt={link.image_alt ?? ""}
                  className="size-full object-cover"
                  fallback={<ImagePlaceholder link={link} />}
                />
              </div>
              <div className="flex flex-1 flex-col gap-2 p-4">
                <div className="flex items-center gap-2 text-xs text-muted">
                  <Favicon src={link.favicon} />
                  <span className="truncate">{link.site_name ?? hostname(link.url)}</span>
                </div>
                <h2 className="line-clamp-2 font-semibold leading-snug group-hover:underline">
                  {link.title ?? hostname(link.url)}
                </h2>
                {link.description && (
                  <p className="line-clamp-3 text-sm text-muted">{link.description}</p>
                )}
                {link.tags.length > 0 && (
                  <p className="mt-auto flex flex-wrap gap-1 pt-1">
                    {link.tags.slice(0, 5).map((tag) => (
                      <span key={tag} className="rounded-full bg-subtle px-2 py-0.5 text-xs text-muted">
                        #{tag}
                      </span>
                    ))}
                  </p>
                )}
              </div>
            </a>
          ))}
        </div>
      )}

      <footer className="mt-12 text-center text-sm text-muted">
        Saved with{" "}
        <Link href="/login" className="font-medium underline">
          {APP_NAME}
        </Link>
      </footer>
    </main>
  );
}

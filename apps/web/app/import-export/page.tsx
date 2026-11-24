import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";
import { profileFromUser } from "@/lib/profile";
import { APP_NAME } from "@/lib/brand";
import { siteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "Import & export" };

// The import action keeps fetching previews in the background (after()) for up to this long.
export const maxDuration = 300;

function Card({ title, description, children }: { title: string; description: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="font-semibold">{title}</h2>
      <p className="mb-4 mt-1 text-sm text-zinc-500">{description}</p>
      {children}
    </section>
  );
}

const button =
  "inline-flex items-center rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800";

export default async function ImportExportPage() {
  const supabase = await createClient();
  const [{ data: userData }, origin] = await Promise.all([supabase.auth.getUser(), siteUrl()]);

  // Opens /?url=<current page> in a new tab, where the URL is pre-filled in the save box.
  const bookmarklet = `javascript:(function(){window.open(${JSON.stringify(`${origin}/?url=`)}+encodeURIComponent(location.href),'_blank');})();`;
  const escaped = bookmarklet.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

  return (
    <>
      <SiteHeader user={profileFromUser(userData.user)} />
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Import &amp; export</h1>

        <Card
          title="Import bookmarks"
          description={
            <>
              Upload the bookmarks <code>.html</code> file exported from Chrome, Edge, Firefox, Safari, Raindrop,
              Pocket or linkding, or paste a list of links. Duplicates are skipped, tags and save dates are kept,
              and previews are fetched in the background.
            </>
          }
        >
          <ImportForm />
          <details className="mt-4 text-sm text-zinc-500">
            <summary className="cursor-pointer">Where do I find my bookmarks file?</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <b>Chrome / Edge / Brave:</b> open <code>chrome://bookmarks</code> → ⋮ menu → <i>Export bookmarks</i>.
              </li>
              <li>
                <b>Firefox:</b> Bookmarks → <i>Manage bookmarks</i> → Import and Backup → <i>Export Bookmarks to HTML</i>.
              </li>
              <li>
                <b>Safari:</b> File → Export → <i>Bookmarks…</i>
              </li>
              <li>
                <b>Raindrop.io:</b> Settings → Backups / Export → <i>HTML</i>.
              </li>
            </ul>
          </details>
        </Card>

        <Card title="Export" description="Download everything you've saved. The HTML file can be imported into any browser or bookmark app.">
          <div className="flex flex-wrap gap-2">
            <a href="/export?format=html" className={button} download>
              ⬇ Bookmarks HTML
            </a>
            <a href="/export?format=json" className={button} download>
              ⬇ JSON (all metadata)
            </a>
          </div>
        </Card>

        <Card
          title="Save from any page"
          description={`Drag this button to your bookmarks bar. Click it on any page to open ${APP_NAME} with that page ready to save.`}
        >
          {/* React refuses javascript: URLs in href, so the bookmarklet is plain HTML. */}
          <div
            dangerouslySetInnerHTML={{
              __html: `<a href="${escaped}" class="inline-flex cursor-grab items-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-zinc-900" onclick="event.preventDefault()" title="Drag me to your bookmarks bar">⛓ Save to ${APP_NAME}</a>`,
            }}
          />
        </Card>
      </main>
    </>
  );
}

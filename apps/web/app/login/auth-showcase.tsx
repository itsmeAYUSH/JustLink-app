import { APP_NAME } from "@/lib/brand";
import { CheckIcon, ImageIcon, ImportIcon, LinkIcon, SearchIcon, SparkleIcon } from "@/components/icons";

export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <span className="grid size-9 place-items-center rounded-xl bg-linear-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-lg ring-1 shadow-violet-500/30 ring-white/20">
        <LinkIcon className="size-[18px]" strokeWidth={2.2} />
      </span>
      <span className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-white">{APP_NAME}</span>
    </div>
  );
}

/** Full-page backdrop for the auth screens: drifting color fields over a deep indigo base. */
export function AuroraBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-linear-to-br from-[#f5f3ff] via-[#f8fafc] to-[#eef2ff] dark:from-[#0c0a24] dark:via-[#0a0b1e] dark:to-[#071426]" />
      <div className="absolute -top-[25%] -left-[15%] size-[46rem] rounded-full bg-indigo-400/35 blur-[120px] motion-safe:animate-aurora-1 dark:bg-indigo-600/35" />
      <div className="absolute -top-[10%] -right-[15%] size-[40rem] rounded-full bg-fuchsia-300/40 blur-[120px] motion-safe:animate-aurora-2 dark:bg-fuchsia-600/25" />
      <div className="absolute -bottom-[30%] left-[25%] size-[44rem] rounded-full bg-cyan-300/40 blur-[130px] motion-safe:animate-aurora-3 dark:bg-cyan-500/20" />
      <div className="auth-grid absolute inset-0" />
      <div className="auth-noise absolute inset-0 opacity-[0.18] mix-blend-soft-light dark:opacity-[0.12]" />
    </div>
  );
}

const features = [
  { icon: ImageIcon, title: "Rich previews, automatically", text: "Image, title, description and tags for every link." },
  { icon: SearchIcon, title: "Find anything in seconds", text: "Folders, tags and full-text search." },
  { icon: ImportIcon, title: "Bring your bookmarks", text: "Import from Chrome, Firefox, Safari, Pocket and more." },
];

/** Left-hand column on wide screens: what the product is, with a mock of a saved link. */
export function AuthShowcase() {
  return (
    <section className="hidden flex-col lg:flex motion-safe:animate-fade-up">
      <BrandMark />

      <div className="mt-12 inline-flex w-fit items-center gap-2 rounded-full border border-indigo-200/70 bg-white/60 px-3 py-1 text-xs font-medium text-indigo-700 backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-indigo-200">
        <SparkleIcon className="size-3.5" />
        Your personal link library
      </div>

      <h2 className="mt-5 text-5xl leading-[1.05] font-semibold tracking-tight text-zinc-900 xl:text-[3.5rem] dark:text-white">
        Save every link.
        <br />
        <span className="bg-linear-to-r from-indigo-600 via-violet-600 to-fuchsia-500 bg-clip-text text-transparent dark:from-indigo-300 dark:via-violet-300 dark:to-fuchsia-300">
          Find it in seconds.
        </span>
      </h2>
      <p className="mt-5 max-w-md text-[17px] leading-relaxed text-zinc-600 dark:text-zinc-400">
        {APP_NAME} fetches the preview, title and tags for every URL you save, so your bookmarks become a library
        you actually want to browse.
      </p>

      <PreviewStack />

      <ul className="mt-12 grid max-w-lg gap-4">
        {features.map(({ icon: FeatureIcon, title, text }) => (
          <li key={title} className="flex items-start gap-3.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/70 bg-white/70 text-indigo-600 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-indigo-300">
              <FeatureIcon className="size-[18px]" />
            </span>
            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-white">{title}</p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">{text}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Two decorative "saved link" cards, fanned out. */
function PreviewStack() {
  return (
    <div aria-hidden="true" className="relative mt-10 h-48 max-w-lg select-none">
      <div className="absolute top-3 left-10 w-80 rotate-[-5deg] motion-safe:animate-float-slow">
        <MockCard
          gradient="from-cyan-400 via-sky-500 to-indigo-500"
          domain="field-notes.blog"
          title="Designing software that feels calm"
          tags={["design", "reading"]}
          faded
        />
      </div>
      <div className="absolute top-0 left-44 w-80 rotate-[3deg] motion-safe:animate-float">
        <MockCard
          gradient="from-indigo-500 via-violet-500 to-fuchsia-500"
          domain="type.guide"
          title="A practical guide to web typography"
          tags={["typography", "favorites"]}
        />
        <div className="absolute -right-4 -bottom-4 flex items-center gap-1.5 rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-xs font-medium text-emerald-700 shadow-lg shadow-emerald-900/10 dark:border-emerald-400/20 dark:bg-[#0d1f22] dark:text-emerald-300">
          <CheckIcon className="size-3.5" strokeWidth={2.5} />
          Preview saved
        </div>
      </div>
    </div>
  );
}

function MockCard({
  gradient,
  domain,
  title,
  tags,
  faded = false,
}: {
  gradient: string;
  domain: string;
  title: string;
  tags: string[];
  faded?: boolean;
}) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-white/80 bg-white/85 shadow-2xl shadow-indigo-900/15 backdrop-blur-xl dark:border-white/10 dark:bg-[#15142f]/85 dark:shadow-black/40 ${faded ? "opacity-70" : ""}`}
    >
      <div className={`relative h-20 bg-linear-to-br ${gradient}`}>
        <div className="absolute top-3 right-6 size-14 rounded-full bg-white/25 blur-sm" />
        <div className="absolute -bottom-6 left-8 size-20 rounded-full border-[6px] border-white/25" />
      </div>
      <div className="space-y-2 p-3.5">
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
          <span className={`size-3 rounded-full bg-linear-to-br ${gradient}`} />
          {domain}
        </div>
        <p className="text-sm leading-snug font-medium text-zinc-900 dark:text-white">{title}</p>
        <div className="flex gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-600 dark:bg-white/10 dark:text-indigo-200"
            >
              #{tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

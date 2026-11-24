import { APP_NAME } from "@/lib/brand";
import { CheckIcon, ImportIcon, ImageIcon, LinkIcon, SearchIcon } from "@/components/icons";

export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <span className="grid size-9 place-items-center rounded-xl bg-brand text-on-brand">
        <LinkIcon className="size-[18px]" strokeWidth={2.2} />
      </span>
      <span className="text-lg font-semibold tracking-tight text-ink">{APP_NAME}</span>
    </div>
  );
}

/** Full-page backdrop for the auth screens: the page colour, a faint grid and one soft glow. */
export function AuthBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-canvas">
      <div className="absolute -top-[30%] -left-[10%] size-[42rem] rounded-full bg-brand/10 blur-[120px]" />
      <div className="absolute -right-[10%] -bottom-[35%] size-[38rem] rounded-full bg-brand/8 blur-[120px]" />
      <div className="auth-grid absolute inset-0" />
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

      <p className="mt-8 inline-flex w-fit items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted">
        <span className="size-1.5 rounded-full bg-brand" />
        Your personal link library
      </p>

      <h2 className="mt-5 text-5xl leading-[1.05] font-semibold tracking-tight text-ink xl:text-[3.5rem] shorter:mt-4 shorter:text-[2.75rem] xl:shorter:text-[2.75rem]">
        Save every link.
        <br />
        <span className="text-brand">Find it in seconds.</span>
      </h2>
      <p className="mt-5 max-w-md text-[17px] leading-relaxed text-muted shorter:mt-3 shorter:text-base">
        {APP_NAME} fetches the preview, title and tags for every URL you save, so your bookmarks become a library
        you actually want to browse.
      </p>

      <PreviewStack />

      {/* Left out on shorter windows, so the page still fits without scrolling. */}
      <ul className="mt-8 grid max-w-lg gap-4 short:hidden">
        {features.map(({ icon: FeatureIcon, title, text }) => (
          <li key={title} className="flex items-start gap-3.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-line bg-surface text-brand">
              <FeatureIcon className="size-[18px]" />
            </span>
            <div>
              <p className="text-sm font-medium text-ink">{title}</p>
              <p className="text-sm text-muted">{text}</p>
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
    <div aria-hidden="true" className="relative mt-8 h-48 max-w-lg select-none shortest:hidden">
      <div className="absolute top-3 left-10 w-80 rotate-[-4deg] motion-safe:animate-float-slow">
        <MockCard domain="field-notes.blog" title="Designing software that feels calm" tags={["design", "reading"]} faded />
      </div>
      <div className="absolute top-0 left-44 w-80 rotate-[3deg] motion-safe:animate-float">
        <MockCard domain="type.guide" title="A practical guide to web typography" tags={["typography", "favorites"]} />
        <div className="absolute -right-4 -bottom-4 flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium text-brand-ink shadow-sm">
          <CheckIcon className="size-3.5 text-brand" strokeWidth={2.5} />
          Preview saved
        </div>
      </div>
    </div>
  );
}

function MockCard({
  domain,
  title,
  tags,
  faded = false,
}: {
  domain: string;
  title: string;
  tags: string[];
  faded?: boolean;
}) {
  return (
    <div
      className={`overflow-hidden rounded-xl border border-line bg-surface shadow-[0_18px_50px_-24px_rgb(0_0_0/0.25)] ${faded ? "opacity-70" : ""}`}
    >
      <div className="relative h-20 overflow-hidden bg-brand-soft">
        <div className="absolute -top-6 right-8 size-20 rounded-full bg-brand/15" />
        <div className="absolute bottom-4 left-4 h-2.5 w-28 rounded-full bg-brand/20" />
        <div className="absolute bottom-9 left-4 h-2.5 w-16 rounded-full bg-brand/15" />
      </div>
      <div className="space-y-2 p-3.5">
        <div className="flex items-center gap-1.5 text-[11px] text-muted">
          <span className="size-3 rounded-sm bg-line" />
          {domain}
        </div>
        <p className="text-sm leading-snug font-medium text-ink">{title}</p>
        <div className="flex gap-1.5">
          {tags.map((tag) => (
            <span key={tag} className="rounded-md bg-brand-soft px-1.5 py-0.5 text-[11px] font-medium text-brand-ink">
              #{tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

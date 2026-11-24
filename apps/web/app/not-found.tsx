import type { Metadata } from "next";
import Link from "next/link";
import { AuthBackground, BrandMark } from "@/app/login/auth-showcase";
import { BackButton } from "@/components/back-button";
import { ArrowLeftIcon, LinkOffIcon } from "@/components/icons";

export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <main className="relative isolate flex min-h-dvh flex-1 flex-col items-center justify-center overflow-hidden px-5 py-12">
      <AuthBackground />

      <div className="w-full max-w-md motion-safe:animate-fade-up">
        <Link
          href="/"
          className="mx-auto mb-8 flex w-fit rounded-xl focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-none"
        >
          <BrandMark />
        </Link>

        <section
          aria-labelledby="not-found-title"
          className="rounded-2xl border border-line bg-surface p-7 text-center shadow-[0_24px_60px_-32px_rgb(0_0_0/0.3)] sm:p-9"
        >
          <div className="mx-auto mb-5 flex w-fit flex-col items-center gap-3">
            <span className="grid size-12 place-items-center rounded-xl bg-brand-soft text-brand">
              <LinkOffIcon className="size-6" />
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-subtle px-2.5 py-0.5 font-mono text-xs font-medium text-muted">
              404
            </span>
          </div>

          <h1 id="not-found-title" className="text-2xl font-semibold tracking-tight text-ink">
            Page not found
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            The link you followed may be broken, removed, or no longer shared.
          </p>

          <div className="mt-7 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-on-brand transition-colors hover:bg-brand/90 focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-none"
            >
              <ArrowLeftIcon className="size-4" />
              Back to library
            </Link>
            <BackButton className="inline-flex items-center justify-center rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-subtle focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-none">
              Go back
            </BackButton>
          </div>
        </section>
      </div>
    </main>
  );
}

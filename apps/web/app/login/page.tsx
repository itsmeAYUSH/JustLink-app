import type { Metadata } from "next";
import { AuthBackground, AuthShowcase, BrandMark } from "./auth-showcase";
import { ShieldIcon } from "@/components/icons";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/";
  const error =
    params.account === "deleted"
      ? {
          title: "Your account was deleted",
          message: "You've been signed out everywhere, and this account can't be signed in to any more.",
        }
      : typeof params.error === "string"
        ? { title: "We couldn't confirm your email", message: params.error }
        : undefined;
  const mode = params.mode === "signup" ? "signup" : "signin";

  return (
    // Exactly one screen tall: the content shrinks to fit shorter windows instead of scrolling.
    // Only a very short window (a phone on its side) can scroll, so the form is never cut off.
    <main className="relative isolate flex h-dvh overflow-hidden shortest:overflow-y-auto">
      <AuthBackground />

      <div className="mx-auto grid w-full max-w-7xl flex-1 items-center gap-12 px-5 py-8 short:py-6 shorter:py-5 lg:grid-cols-[1.1fr_1fr] lg:px-10 xl:gap-20">
        <AuthShowcase />

        <div className="mx-auto w-full max-w-[440px] motion-safe:animate-fade-up motion-safe:[animation-delay:120ms]">
          <BrandMark className="mb-8 justify-center shorter:mb-5 lg:hidden" />

          <div className="rounded-2xl border border-line bg-surface p-6 shadow-[0_24px_60px_-32px_rgb(0_0_0/0.3)] sm:p-9 sm:short:p-8 sm:shorter:p-7">
            <LoginForm next={next} initialError={error} initialMode={mode} />
          </div>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted shorter:mt-4">
            <ShieldIcon className="size-3.5" />
            Your links are private unless you share a folder.
          </p>
        </div>
      </div>
    </main>
  );
}

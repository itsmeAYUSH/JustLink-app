import type { Metadata } from "next";
import { AuroraBackground, AuthShowcase, BrandMark } from "./auth-showcase";
import { ShieldIcon } from "@/components/icons";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/";
  const error = typeof params.error === "string" ? params.error : undefined;
  const mode = params.mode === "signup" ? "signup" : "signin";

  return (
    <main className="relative isolate flex min-h-dvh flex-1 overflow-hidden">
      <AuroraBackground />

      <div className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-16 px-5 py-10 sm:py-16 lg:grid-cols-[1.1fr_1fr] lg:px-8">
        <AuthShowcase />

        <div className="mx-auto w-full max-w-[440px] motion-safe:animate-fade-up motion-safe:[animation-delay:120ms]">
          <BrandMark className="mb-8 justify-center lg:hidden" />

          <div className="relative">
            {/* Soft glow behind the card. */}
            <div
              aria-hidden="true"
              className="absolute -inset-px rounded-[28px] bg-linear-to-br from-indigo-500/40 via-violet-500/20 to-fuchsia-500/40 opacity-60 blur-2xl dark:opacity-50"
            />
            <div className="relative rounded-[28px] bg-linear-to-b from-white to-white/40 p-px shadow-2xl shadow-indigo-950/10 dark:from-white/20 dark:to-white/5 dark:shadow-black/50">
              <div className="rounded-[27px] bg-white/80 p-6 backdrop-blur-2xl sm:p-9 dark:bg-[#0f0e26]/80">
                <LoginForm next={next} initialError={error} initialMode={mode} />
              </div>
            </div>
          </div>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            <ShieldIcon className="size-3.5" />
            Your links are private unless you share a collection.
          </p>
        </div>
      </div>
    </main>
  );
}

import type { Metadata } from "next";
import { APP_NAME } from "@/lib/brand";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/";
  const error = typeof params.error === "string" ? params.error : undefined;

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid size-12 place-items-center rounded-xl bg-zinc-900 text-xl text-white dark:bg-white dark:text-zinc-900">
            ⛓
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{APP_NAME}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Sign in to save links and see their previews.
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <LoginForm next={next} initialError={error} />
        </div>
      </div>
    </main>
  );
}

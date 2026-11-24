import Link from "next/link";
import { signOut } from "@/app/actions";
import { APP_NAME } from "@/lib/brand";
import { SubmitButton } from "./submit-button";

export function SiteHeader({ email }: { email: string | undefined }) {
  return (
    <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid size-7 place-items-center rounded-md bg-zinc-900 text-sm text-white dark:bg-white dark:text-zinc-900">
            ⛓
          </span>
          {APP_NAME}
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/import-export" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white">
            Import / Export
          </Link>
          {email && <span className="hidden text-zinc-500 md:inline">{email}</span>}
          <form action={signOut}>
            <SubmitButton variant="secondary" pendingText="Signing out…" className="px-3 py-1.5">
              Sign out
            </SubmitButton>
          </form>
        </div>
      </div>
    </header>
  );
}

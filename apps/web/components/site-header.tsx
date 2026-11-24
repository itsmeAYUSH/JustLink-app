import Link from "next/link";
import { signOut } from "@/app/actions";
import { APP_NAME } from "@/lib/brand";
import { displayName, type Profile } from "@/lib/profile";
import { Avatar } from "./avatar";
import { LinkIcon } from "./icons";
import { SubmitButton } from "./submit-button";

export function SiteHeader({ user }: { user: Profile | null }) {
  return (
    <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid size-7 place-items-center rounded-lg bg-linear-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-sm ring-1 ring-white/20">
            <LinkIcon className="size-4" strokeWidth={2.2} />
          </span>
          {APP_NAME}
        </Link>
        <div className="flex items-center gap-2 text-sm">
          <Link
            href="/import-export"
            className="rounded-lg px-2.5 py-1.5 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
          >
            Import / Export
          </Link>
          {user && (
            <Link
              href="/profile"
              title="Your profile"
              className="flex items-center gap-2 rounded-full py-1 pr-3 pl-1 text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <Avatar profile={user} size={28} />
              <span className="hidden max-w-40 truncate font-medium md:inline">{displayName(user)}</span>
            </Link>
          )}
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

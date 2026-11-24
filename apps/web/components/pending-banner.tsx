"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { fetchPendingPreviews } from "@/app/actions";
import { SubmitButton } from "./submit-button";

/**
 * Shown while imported links still wait for their previews. Re-renders the page
 * every few seconds so cards fill in as the background job (after()) finishes them.
 */
export function PendingBanner({ count }: { count: number }) {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), 5_000);
    return () => clearInterval(timer);
  }, [router]);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200">
      <span className="size-2 animate-pulse rounded-full bg-sky-500" />
      <span className="flex-1">
        Fetching previews for {count} link{count === 1 ? "" : "s"}…
      </span>
      <form action={fetchPendingPreviews}>
        <SubmitButton variant="secondary" pendingText="Starting…" className="px-3 py-1 text-xs">
          Not moving? Restart
        </SubmitButton>
      </form>
    </div>
  );
}

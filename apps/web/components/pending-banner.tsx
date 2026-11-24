"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { fetchPendingPreviews } from "@/app/actions";
import { SpinnerIcon } from "./icons";
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
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm text-muted">
      <SpinnerIcon className="size-4 text-brand" />
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

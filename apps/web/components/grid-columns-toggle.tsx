"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { GRID_COLUMN_CHOICES, GRID_COLUMNS_COOKIE, type GridColumns } from "@/lib/preferences";
import { ColumnsIcon } from "./icons";

function remember(columns: GridColumns) {
  document.cookie = `${GRID_COLUMNS_COOKIE}=${columns}; path=/; max-age=31536000; samesite=lax`;
}

/** Picks how many cards a row of the grid holds: 3, 4 or 5. Remembered in this browser for a year. */
export function GridColumnsToggle({ columns }: { columns: GridColumns }) {
  const router = useRouter();
  const [shown, setShown] = useOptimistic(columns);
  const [, startTransition] = useTransition();

  function pick(next: GridColumns) {
    remember(next);
    startTransition(() => {
      setShown(next);
      router.refresh();
    });
  }

  return (
    <div
      role="group"
      aria-label="Cards per row"
      title="Cards per row"
      className="hidden h-9 items-center rounded-lg bg-subtle p-0.5 md:flex"
    >
      <ColumnsIcon className="mx-1.5 size-4 text-muted" />
      {GRID_COLUMN_CHOICES.map((count) => {
        const active = shown === count;
        return (
          <button
            key={count}
            type="button"
            onClick={() => pick(count)}
            aria-pressed={active}
            aria-label={`${count} per row`}
            title={`Up to ${count} per row`}
            className={`grid h-8 w-8 place-items-center rounded-md text-sm font-medium tabular-nums transition-colors focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-none ${
              active ? "bg-surface text-ink shadow-xs" : "text-muted hover:text-ink"
            }`}
          >
            {count}
          </button>
        );
      })}
    </div>
  );
}

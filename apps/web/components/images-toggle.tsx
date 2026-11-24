"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { HIDE_IMAGES_COOKIE } from "@/lib/preferences";
import { ImageIcon, ImageOffIcon } from "./icons";

/** Shows or hides preview images on cards and rows. Remembered in this browser for a year. */
export function ImagesToggle({ hidden }: { hidden: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle() {
    document.cookie = hidden
      ? `${HIDE_IMAGES_COOKIE}=; path=/; max-age=0; samesite=lax`
      : `${HIDE_IMAGES_COOKIE}=1; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => router.refresh());
  }

  const label = hidden ? "Show preview images" : "Hide preview images";
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={hidden}
      title={label}
      aria-label={label}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none disabled:opacity-60 ${
        hidden
          ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-200"
          : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
      }`}
    >
      {hidden ? <ImageOffIcon className="size-4" /> : <ImageIcon className="size-4" />}
      <span className="hidden sm:inline">{hidden ? "Images off" : "Images"}</span>
    </button>
  );
}

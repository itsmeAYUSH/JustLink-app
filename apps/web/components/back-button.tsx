"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/** Navigates back in browser history when possible, otherwise falls back to `fallbackHref`. */
export function BackButton({
  fallbackHref = "/",
  className = "",
  children,
}: {
  fallbackHref?: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push(fallbackHref);
      }}
      className={className}
    >
      {children}
    </button>
  );
}

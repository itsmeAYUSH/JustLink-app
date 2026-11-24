"use client";

import { useState, type ReactNode } from "react";

type Props = {
  src: string | null;
  alt: string;
  className?: string;
  fallback?: ReactNode;
};

/**
 * Plain <img> for third-party images (OG images, favicons). Many of them are
 * broken or block hotlinking, so we swap in `fallback` when loading fails.
 */
export function FallbackImage({ src, alt, className, fallback = null }: Props) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src || failedSrc === src) return <>{fallback}</>;

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailedSrc(src)}
    />
  );
}

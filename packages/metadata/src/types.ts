/** A single `<meta>` tag found on the page, e.g. `{ key: "og:title", value: "Hello" }`. */
export interface MetaTag {
  key: string;
  value: string;
}

/** Everything we could learn about a URL. Fields are `null` when the page did not provide them. */
export interface LinkMetadata {
  /** The URL that was requested (normalized). */
  url: string;
  /** The URL after following redirects. */
  finalUrl: string;
  /** `og:url` or `<link rel="canonical">`, if present. */
  canonicalUrl: string | null;
  statusCode: number | null;
  contentType: string | null;

  title: string | null;
  description: string | null;
  siteName: string | null;
  /** `og:type`, e.g. "website", "article", "video.other". */
  type: string | null;

  image: string | null;
  imageAlt: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  favicon: string | null;
  video: string | null;

  author: string | null;
  publishedTime: string | null;
  modifiedTime: string | null;
  /** Merged from `<meta name="keywords">`, `news_keywords` and `article:tag`. */
  keywords: string[];

  themeColor: string | null;
  locale: string | null;
  twitterCard: string | null;
  twitterSite: string | null;
  twitterCreator: string | null;

  /** Every `<meta>` tag with a name/property/itemprop and content, in document order. */
  metaTags: MetaTag[];
}

export interface FetchMetadataOptions {
  /** Abort the whole request (redirects + body) after this many ms. Default 10 000. */
  timeoutMs?: number;
  /** Stop reading the body after this many bytes. Default 2 MiB. */
  maxBytes?: number;
  /** Maximum redirects to follow. Default 5. */
  maxRedirects?: number;
  userAgent?: string;
}

export type MetadataErrorCode =
  | "INVALID_URL"
  | "BLOCKED_ADDRESS"
  | "TOO_MANY_REDIRECTS"
  | "TIMEOUT"
  | "NETWORK_ERROR";

export class MetadataError extends Error {
  readonly code: MetadataErrorCode;

  constructor(code: MetadataErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "MetadataError";
    this.code = code;
  }
}

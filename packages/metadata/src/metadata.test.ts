import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fetchMetadata, isBlockedAddress, MetadataError, normalizeUrl, parseMetadata } from "./index.js";

describe("normalizeUrl", () => {
  it("adds https:// when the scheme is missing", () => {
    expect(normalizeUrl("example.com/path")).toBe("https://example.com/path");
    expect(normalizeUrl("  example.com:8080/a  ")).toBe("https://example.com:8080/a");
  });

  it("drops the fragment", () => {
    expect(normalizeUrl("https://example.com/a#section")).toBe("https://example.com/a");
  });

  it("rejects non-http schemes and garbage", () => {
    expect(() => normalizeUrl("javascript:alert(1)")).toThrow(MetadataError);
    expect(() => normalizeUrl("ftp://example.com")).toThrow(MetadataError);
    expect(() => normalizeUrl("")).toThrow(MetadataError);
    expect(() => normalizeUrl("https://user:pass@example.com")).toThrow(MetadataError);
  });
});

describe("isBlockedAddress", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "0.0.0.0",
    "::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:a9fe:a9fe",
    "fd00::1",
    "fe80::1",
    "not-an-ip",
  ])("blocks %s", (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "::ffff:8.8.8.8", "2606:4700:4700::1111"])("allows %s", (address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });
});

describe("parseMetadata", () => {
  const html = `<!doctype html>
    <html lang="en-GB">
    <head>
      <meta charset="utf-8">
      <title>  Fallback   title </title>
      <meta property="og:title" content="OG Title">
      <meta property="og:description" content="OG description &amp; more">
      <meta property="og:image" content="/images/cover.png">
      <meta property="og:image:width" content="1200">
      <meta property="og:image:height" content="630">
      <meta property="og:image:alt" content="A cover">
      <meta property="og:site_name" content="Example">
      <meta property="og:type" content="article">
      <meta property="article:published_time" content="2026-01-02T03:04:05Z">
      <meta property="article:tag" content="Next.js">
      <meta property="article:tag" content="Supabase">
      <meta name="keywords" content="typescript, next.js, turborepo">
      <meta name="author" content="Jane Doe">
      <meta name="theme-color" content="#0f172a">
      <meta name="twitter:card" content="summary_large_image">
      <meta name="twitter:site" content="@example">
      <link rel="canonical" href="https://example.com/post">
      <link rel="icon" href="/favicon-16.png" sizes="16x16">
      <link rel="icon" href="/favicon-32.png" sizes="32x32">
      <link rel="apple-touch-icon" href="/apple.png">
    </head>
    <body><h1>Hello</h1></body>
    </html>`;

  const meta = parseMetadata(html, "https://example.com/blog/post?x=1");

  it("prefers Open Graph values and resolves relative URLs", () => {
    expect(meta.title).toBe("OG Title");
    expect(meta.description).toBe("OG description & more");
    expect(meta.image).toBe("https://example.com/images/cover.png");
    expect(meta.imageWidth).toBe(1200);
    expect(meta.imageHeight).toBe(630);
    expect(meta.imageAlt).toBe("A cover");
    expect(meta.siteName).toBe("Example");
    expect(meta.type).toBe("article");
    expect(meta.canonicalUrl).toBe("https://example.com/post");
  });

  it("picks the largest icon", () => {
    expect(meta.favicon).toBe("https://example.com/favicon-32.png");
  });

  it("merges keywords and article tags without duplicates", () => {
    expect(meta.keywords).toEqual(["typescript", "next.js", "turborepo", "Supabase"]);
  });

  it("reads the remaining fields", () => {
    expect(meta.author).toBe("Jane Doe");
    expect(meta.publishedTime).toBe("2026-01-02T03:04:05Z");
    expect(meta.themeColor).toBe("#0f172a");
    expect(meta.locale).toBe("en-GB");
    expect(meta.twitterCard).toBe("summary_large_image");
    expect(meta.twitterSite).toBe("@example");
    expect(meta.metaTags).toContainEqual({ key: "og:title", value: "OG Title" });
  });

  it("falls back to <title> and /favicon.ico", () => {
    const fallback = parseMetadata("<title>Just a title</title>", "https://example.org/a/b");
    expect(fallback.title).toBe("Just a title");
    expect(fallback.favicon).toBe("https://example.org/favicon.ico");
    expect(fallback.image).toBeNull();
    expect(fallback.keywords).toEqual([]);
  });

  it("never returns javascript: URLs", () => {
    const evil = parseMetadata(
      `<meta property="og:image" content="javascript:alert(1)"><link rel="icon" href="data:image/png;base64,AAA">`,
      "https://example.org/",
    );
    expect(evil.image).toBeNull();
    expect(evil.favicon).toBe("https://example.org/favicon.ico");
  });
});

describe("fetchMetadata SSRF protection", () => {
  let server: http.Server;
  let port = 0;

  beforeAll(async () => {
    server = http.createServer((_req, res) => {
      res.setHeader("content-type", "text/html");
      res.end("<title>internal</title>");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it.each([
    () => `http://127.0.0.1:${port}/`,
    () => `http://localhost:${port}/`,
    () => `http://[::1]:${port}/`,
    () => "http://169.254.169.254/latest/meta-data/",
  ])("refuses to fetch private addresses (%#)", async (makeUrl) => {
    await expect(fetchMetadata(makeUrl())).rejects.toMatchObject({ code: "BLOCKED_ADDRESS" });
  });
});

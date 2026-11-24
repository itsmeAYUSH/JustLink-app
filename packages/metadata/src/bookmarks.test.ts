import { describe, expect, it } from "vitest";
import { normalizeUrl, parseBookmarkFile, toBookmarkHtml, urlKey } from "./index.js";

describe("tracking params and duplicate keys", () => {
  it("strips tracking parameters but keeps real ones", () => {
    expect(normalizeUrl("https://example.com/a?utm_source=x&id=7&fbclid=abc&UTM_Medium=y")).toBe(
      "https://example.com/a?id=7",
    );
    expect(normalizeUrl("https://youtu.be/dQw4w9WgXcQ?si=tracking")).toBe("https://youtu.be/dQw4w9WgXcQ");
  });

  it("rejects bare words", () => {
    expect(() => normalizeUrl("hello")).toThrow();
  });

  it("gives the same key to URLs that lead to the same page", () => {
    const key = "example.com/a?a=1&b=2";
    expect(urlKey("https://www.example.com/a/?b=2&a=1&utm_source=x")).toBe(key);
    expect(urlKey("http://example.com/a?a=1&b=2#top")).toBe(key);
    expect(urlKey("example.com/a?b=2&a=1")).toBe(key);
    expect(urlKey("https://example.com/")).toBe("example.com");
    expect(urlKey("https://example.com/A")).not.toBe(urlKey("https://example.com/a"));
  });
});

describe("parseBookmarkFile", () => {
  const chromeExport = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1700000000" PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3>
    <DL><p>
        <DT><A HREF="https://nextjs.org/" ADD_DATE="1700000001">Next.js</A>
        <DT><H3>Dev</H3>
        <DL><p>
            <DT><H3>React</H3>
            <DL><p>
                <DT><A HREF="https://react.dev/?utm_source=x" ADD_DATE="1700000002" TAGS="react,docs">React &amp; friends</A>
                <DD>The library for web and native user interfaces
            </DL><p>
            <DT><A HREF="https://supabase.com" ADD_DATE="1700000003">Supabase</A>
        </DL><p>
        <DT><A HREF="javascript:alert(1)">A bookmarklet</A>
        <DT><A HREF="https://nextjs.org/">Duplicate</A>
    </DL><p>
</DL><p>`;

  const entries = parseBookmarkFile(chromeExport);

  it("reads every http(s) bookmark once", () => {
    expect(entries.map((entry) => entry.url)).toEqual([
      "https://nextjs.org/",
      "https://react.dev/",
      "https://supabase.com/",
    ]);
  });

  it("keeps folders (minus browser root folders), tags, descriptions and dates", () => {
    const [nextjs, react, supabase] = entries;
    expect(nextjs?.folder).toBeNull();
    expect(react).toMatchObject({
      title: "React & friends",
      folder: "Dev / React",
      tags: ["react", "docs"],
      description: "The library for web and native user interfaces",
    });
    expect(react?.addedAt?.toISOString()).toBe("2023-11-14T22:13:22.000Z");
    expect(supabase?.folder).toBe("Dev");
  });

  it("falls back to any URLs in plain text", () => {
    const list = parseBookmarkFile("Read later:\nhttps://a.example.com/x, and (https://b.example.com).\nftp://nope");
    expect(list.map((entry) => entry.url)).toEqual(["https://a.example.com/x", "https://b.example.com/"]);
  });

  it("round-trips through toBookmarkHtml", () => {
    const again = parseBookmarkFile(toBookmarkHtml(entries));
    expect(again).toEqual(entries);
  });
});

/** What the popup shows before saving, plus the <head> the server reads the full preview from. */
export type PageInfo = { html: string; title: string; image: string; siteName: string };

/**
 * Runs inside the page being saved (chrome.scripting.executeScript), so it must not
 * use anything from outside its own body. Returns the page's <head> as the user sees
 * it, without scripts and styles: the server reads titles, descriptions, images and
 * icons from it, so pages behind bot checks or a login still get a proper preview.
 */
export function readPage(): PageInfo {
  const meta = (selector: string) => document.querySelector<HTMLMetaElement>(selector)?.content?.trim() ?? "";
  const absolute = (value: string) => {
    try {
      return value ? new URL(value, location.href).href : "";
    } catch {
      return "";
    }
  };

  let html = "";
  const head = document.head?.cloneNode(true) as HTMLElement | undefined;
  if (head) {
    for (const element of head.querySelectorAll("script, style, noscript, template, svg")) element.remove();
    const lang = (document.documentElement.getAttribute("lang") ?? "").replace(/[^a-zA-Z-]/g, "");
    html = `<html lang="${lang}">${head.outerHTML.slice(0, 900_000)}</html>`;
  }

  return {
    html,
    title: meta('meta[property="og:title"]') || meta('meta[name="twitter:title"]') || document.title.trim(),
    image: absolute(meta('meta[property="og:image"]') || meta('meta[name="twitter:image"]')),
    siteName: meta('meta[property="og:site_name"]') || location.hostname.replace(/^www\./, ""),
  };
}

/** Reads the page in `tabId`; null where pages can't be read (browser pages, the extension store, PDFs). */
export async function snapshotTab(tabId: number): Promise<PageInfo | null> {
  try {
    const [frame] = await chrome.scripting.executeScript({ target: { tabId }, func: readPage });
    return frame?.result ?? null;
  } catch {
    return null;
  }
}

/** Only web pages can be saved. */
export function isSaveableUrl(url: string | undefined): url is string {
  return Boolean(url && /^https?:\/\//i.test(url));
}

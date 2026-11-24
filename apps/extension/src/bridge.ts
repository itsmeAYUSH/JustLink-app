/**
 * Content script on the JustLink site only. Lets the web app ask the extension to
 * open many links as tabs (a website gets one or two; the rest are blocked as pop-ups).
 * The page talks to it with window.postMessage: see apps/web/lib/extension-bridge.ts.
 * A content script can't be a module, so this file has no imports.
 */
{
  const FROM_APP = "justlink-app";
  const FROM_EXTENSION = "justlink-extension";

  const reply = (message: Record<string, unknown>) =>
    window.postMessage({ source: FROM_EXTENSION, ...message }, window.location.origin);

  window.addEventListener("message", (event: MessageEvent) => {
    // Only the JustLink page itself, never a frame or another site.
    if (event.source !== window || event.origin !== window.location.origin) return;
    const data = event.data as { source?: unknown; type?: unknown; id?: unknown; urls?: unknown } | null;
    if (!data || data.source !== FROM_APP || typeof data.id !== "string") return;

    if (data.type === "ping") {
      reply({ type: "pong", id: data.id, version: chrome.runtime.getManifest().version });
    } else if (data.type === "open-tabs" && Array.isArray(data.urls)) {
      chrome.runtime
        .sendMessage<{ opened?: number }>({ type: "open-tabs", urls: data.urls })
        .then((response) => reply({ type: "open-tabs-result", id: data.id, opened: response?.opened ?? 0 }))
        .catch(() => reply({ type: "open-tabs-result", id: data.id, opened: 0, error: true }));
    }
  });
}

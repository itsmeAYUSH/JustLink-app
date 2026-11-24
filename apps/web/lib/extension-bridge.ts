/**
 * Talks to the JustLink browser extension from the web app (browser only). The
 * extension's content script (apps/extension/src/bridge.ts) listens for these
 * window messages on this site. With it installed, "Open" on selected links opens
 * every tab at once; browsers allow a website only one or two.
 */

const FROM_APP = "justlink-app";
const FROM_EXTENSION = "justlink-extension";

type Reply = { source: string; type: string; id: string; opened?: number };

function ask(type: string, payload: Record<string, unknown>, timeoutMs: number): Promise<Reply | null> {
  return new Promise((resolve) => {
    const id = crypto.randomUUID();
    const finish = (reply: Reply | null) => {
      window.removeEventListener("message", onMessage);
      clearTimeout(timer);
      resolve(reply);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const data = event.data as Reply | null;
      if (data?.source === FROM_EXTENSION && data.id === id) finish(data);
    };
    window.addEventListener("message", onMessage);
    const timer = setTimeout(() => finish(null), timeoutMs);
    window.postMessage({ source: FROM_APP, type, id, ...payload }, window.location.origin);
  });
}

let installed: Promise<boolean> | null = null;

/** Whether the extension is installed (and allowed on this site). Asked once per page load. */
export function hasExtension(): Promise<boolean> {
  installed ??= ask("ping", {}, 500).then((reply) => reply?.type === "pong");
  return installed;
}

/** Opens each URL in its own background tab through the extension; null when it isn't installed. */
export async function openTabsWithExtension(urls: string[]): Promise<number | null> {
  if (!(await hasExtension())) return null;
  const reply = await ask("open-tabs", { urls }, 10_000);
  return reply?.type === "open-tabs-result" ? (reply.opened ?? 0) : null;
}

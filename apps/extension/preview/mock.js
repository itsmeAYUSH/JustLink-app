// Stands in for the extension APIs and the JustLink server in the popup preview.
// Never shipped: the build copies only static/ and the compiled src/.
(() => {
  const state = new URLSearchParams(location.search).get("state") || "new";
  const page = {
    id: 1,
    index: 0,
    windowId: 1,
    url: state === "unsupported" ? "chrome://newtab/" : "https://type.guide/practical-web-typography",
    title: "A practical guide to web typography",
    favIconUrl: "",
  };
  let folders = [
    { id: "f1", name: "Workspace", icon: "💼" },
    { id: "f2", name: "Productivity", icon: "⚡" },
    { id: "f3", name: "Tools", icon: "🛠️" },
    { id: "f4", name: "Reading list", icon: "📚" },
    { id: "f5", name: "Design", icon: "🎨" },
    { id: "f6", name: "Private", icon: "🗝️", locked: true },
  ];
  const saved =
    state === "existing" || state === "trash"
      ? {
          id: "l1",
          url: page.url,
          title: page.title,
          image: null,
          favicon: null,
          siteName: "type.guide",
          folderId: state === "existing" ? "f4" : null,
          tags: state === "existing" ? ["typography", "css"] : [],
          note: state === "existing" ? "Read the section on line length." : null,
          inTrash: state === "trash",
          previewError: null,
        }
      : null;
  let link = saved;

  window.chrome = {
    tabs: { query: async () => [page], create: async () => page },
    scripting: {
      executeScript: async () => [
        {
          result: {
            html: "<html><head><title>Sample</title></head></html>",
            title: page.title,
            image: "",
            siteName: "type.guide",
          },
        },
      ],
    },
    runtime: { getManifest: () => ({ version: "0.1.0" }) },
  };
  // The real popup can close itself; here that would close the preview tab.
  window.close = () => document.body.setAttribute("data-closed", "");

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const reply = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const tagList = (text) =>
    String(text)
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

  window.fetch = async (input, init = {}) => {
    if (state === "offline") throw new TypeError("Failed to fetch");
    await wait(state === "loading" ? 1e9 : 200);
    const { pathname } = new URL(String(input));
    const method = init.method || "GET";
    if (pathname.endsWith("/session")) {
      return reply(state === "signed-out" ? { signedIn: false } : { signedIn: true, email: "you@example.com", folders });
    }
    if (pathname.endsWith("/links") && method === "GET") {
      return state === "signed-out" ? reply({ error: "Sign in" }, 401) : reply({ link: saved });
    }
    if (pathname.endsWith("/links") && method === "POST") {
      const body = JSON.parse(init.body);
      let folderId = body.folderId ?? null;
      if (body.newFolder) {
        folderId = `f${folders.length + 1}`;
        folders = [...folders, { id: folderId, name: body.newFolder, icon: "📁" }];
      }
      link = {
        id: "l1",
        url: page.url,
        title: body.title || page.title,
        image: null,
        favicon: null,
        siteName: "type.guide",
        folderId,
        tags: tagList(body.tags ?? ""),
        note: body.note || null,
        inTrash: false,
        previewError: null,
      };
      return reply({ status: saved ? (saved.inTrash ? "restored" : "exists") : "saved", link });
    }
    if (method === "PATCH") {
      const change = JSON.parse(init.body);
      if ("trashed" in change) link = { ...link, inTrash: change.trashed };
      return reply({ link, folder: null });
    }
    return reply({ error: "Not found" }, 404);
  };
})();

import { ApiError, findLink, getSession, saveLink, updateLink, type Folder, type SavedLink, type SaveStatus } from "./api.js";
import { APP_URL } from "./config.js";
import { isSaveableUrl, snapshotTab, type PageInfo } from "./snapshot.js";

/**
 * The toolbar popup. It shows the page and asks before saving: pick a folder
 * (none by default: it just goes into All links), adjust the title, add tags
 * or a note, then Save. A page saved before opens with its current choices to update.
 */

const APP_ORIGIN = new URL(APP_URL).origin;

// ─── Tiny DOM helpers (no framework: the popup must open instantly) ─────────

type Child = Node | string | null | undefined | false;
type Attrs = Record<string, string | number | boolean | null | undefined | ((event: Event) => void)>;

function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (typeof value === "function") element.addEventListener(key.slice(2).toLowerCase(), value);
    else element.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children) if (child !== null && child !== undefined && child !== false) element.append(child);
  return element;
}

/** Fixed, trusted SVG markup only, never page or user text. */
const ICONS = {
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5"/><path d="M12 16.5h.01"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M5.5 7 6.5 19a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2l1-12"/><path d="M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
  folderPlus: '<path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h3.6l2 2.2h7.4a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z"/><path d="M12 11v5"/><path d="M9.5 13.5h5"/>',
  restore: '<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3.5 4v4.5H8"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18"/>',
  tag: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
} as const;

function icon(name: keyof typeof ICONS, className = "icon") {
  const span = h("span", { class: className, "aria-hidden": "true" });
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
  return span;
}

const spinner = () => h("span", { class: "spinner", "aria-hidden": "true" });

/** A picture that falls back to the site's initial when it's missing or fails to load. */
function thumb(sources: (string | null | undefined)[], fallbackText: string, className: string) {
  const box = h("div", { class: className });
  const queue = sources.filter((src): src is string => Boolean(src && /^https?:\/\//i.test(src)));
  const next = () => {
    const src = queue.shift();
    if (!src) {
      box.replaceChildren(h("span", { class: "initial" }, fallbackText.slice(0, 1).toUpperCase()));
      return;
    }
    const img = h("img", { src, alt: "", referrerpolicy: "no-referrer" });
    img.addEventListener("error", next, { once: true });
    box.replaceChildren(img);
  };
  next();
  return box;
}

function openInJustLink(path = "/") {
  void chrome.tabs.create({ url: `${APP_ORIGIN}${path}` });
  window.close();
}

const app = document.getElementById("app") as HTMLElement;
document.getElementById("open-app")?.addEventListener("click", () => openInJustLink());

function show(...children: Child[]) {
  app.replaceChildren(...children.filter((child): child is Node | string => Boolean(child)));
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// ─── State ──────────────────────────────────────────────────────────────────

/** Where the link will go: an existing folder (null = no folder, just All links), or a new folder made on Save. */
type Choice = { kind: "folder"; id: string | null } | { kind: "new"; name: string };

let tab: chrome.tabs.Tab | undefined;
let pageUrl = "";
let page: PageInfo | null = null;
let folders: Folder[] = [];
/** The link as saved before this popup opened, if it was. */
let existing: SavedLink | null = null;
let choice: Choice = { kind: "folder", id: null };
let saving = false;

const byName = (a: Folder, b: Folder) => a.name.localeCompare(b.name);

function folderFor(id: string | null) {
  return id ? folders.find((folder) => folder.id === id) ?? null : null;
}

/** "💼 Workspace", or All links when there is no folder. */
function placeLabel(target: Choice | string | null): string {
  if (target && typeof target === "object" && target.kind === "new") return `📁 ${target.name}`;
  const id = target && typeof target === "object" ? target.id : target;
  const folder = folderFor(id);
  return folder ? `${folder.icon} ${folder.name}` : "All links";
}

// ─── The save form ──────────────────────────────────────────────────────────

/** The parts of the form that change while it's open. */
const form = {
  list: h("div", { class: "folder-list", role: "listbox", "aria-label": "Folder" }),
  newFolder: h("input", {
    type: "text",
    maxlength: 60,
    placeholder: "New folder…",
    "aria-label": "New folder name (press Enter)",
    autocomplete: "off",
  }),
  title: h("textarea", { rows: 2, maxlength: 500, "aria-label": "Title", class: "title-input" }),
  tags: h("input", { type: "text", placeholder: "Tags, separated by commas", "aria-label": "Tags", autocomplete: "off" }),
  note: h("textarea", { rows: 3, maxlength: 10000, placeholder: "A note for yourself (optional)", "aria-label": "Note" }),
  error: h("p", { class: "note note-bad", role: "alert", hidden: true }),
  submit: h("button", { type: "submit", class: "primary save" }),
};

function choose(next: Choice) {
  choice = next;
  renderFolders();
  updateSubmit();
}

/** A locked folder takes links only while it's open in JustLink (opened with the PIN). */
function isClosed(folder: Folder) {
  return Boolean(folder.locked && !folder.open);
}

function folderRow(
  target: Choice,
  name: string,
  iconText: string,
  hint: string | null,
  key: string | null,
  closed = false,
) {
  const selected =
    target.kind === choice.kind &&
    (target.kind === "new" ? choice.kind === "new" : choice.kind === "folder" && target.id === choice.id);
  return h(
    "button",
    {
      type: "button",
      role: "option",
      "aria-selected": selected ? "true" : "false",
      class: `folder${selected ? " is-current" : ""}`,
      disabled: closed,
      title: closed ? "Locked: open this folder in JustLink with your PIN to save here" : undefined,
      onClick: () => choose(target),
    },
    h("span", { class: "folder-icon", "aria-hidden": "true" }, iconText),
    h("span", { class: "folder-name" }, name, hint && h("span", { class: "folder-hint" }, hint)),
    selected ? icon("check", "icon folder-check") : closed ? h("span", { class: "lock", "aria-label": "Locked" }, "🔒") : key ? h("kbd", {}, key) : null,
  );
}

function renderFolders() {
  const hadFocus = form.list.contains(document.activeElement);
  const rows = [
    folderRow({ kind: "folder", id: null }, "All links", "🗂️", "No folder", "0"),
    choice.kind === "new" ? folderRow(choice, choice.name, "📁", "New folder, made when you save", null) : null,
    ...folders.map((folder, index) =>
      folderRow(
        { kind: "folder", id: folder.id },
        folder.name,
        folder.icon,
        isClosed(folder) ? "Locked · add links from inside the folder in JustLink" : folder.locked ? "Locked · open in JustLink now" : null,
        index < 9 ? String(index + 1) : null,
        isClosed(folder),
      ),
    ),
  ];
  form.list.replaceChildren(...rows.filter((row): row is HTMLButtonElement => row !== null));
  if (hadFocus) form.list.querySelector<HTMLElement>(".is-current")?.focus();
}

/** Saves from anywhere in the form: Ctrl+Enter, or ⌘+Enter on a Mac. */
const SAVE_KEYS = navigator.userAgent.includes("Mac") ? "⌘+Enter" : "Ctrl+Enter";

/** "Press 1–5 to pick · Ctrl+Enter to save", with the numbers the folders actually have. */
function shortcutHint() {
  const last = Math.min(folders.length, 9);
  if (last === 0) return `${SAVE_KEYS} to save`;
  return `Press ${last === 1 ? "1" : `1–${last}`} to pick · ${SAVE_KEYS} to save`;
}

function updateSubmit() {
  let label: string;
  if (existing?.inTrash) label = "Restore and save";
  else if (existing) label = "Update";
  else label = choice.kind === "folder" && choice.id === null ? "Save" : `Save to ${placeLabel(choice)}`;
  form.submit.replaceChildren(saving ? spinner() : "", h("span", { class: "save-label" }, saving ? "Saving…" : label));
  form.submit.title = `${label} (${SAVE_KEYS})`;
  form.submit.disabled = saving;
}

function renderForm() {
  const site = page?.siteName || existing?.siteName || hostOf(pageUrl);
  form.title.value = existing?.title || page?.title || tab?.title || site;
  form.tags.value = existing?.tags.join(", ") ?? "";
  form.note.value = existing?.note ?? "";
  form.error.hidden = true;
  renderFolders();
  updateSubmit();

  const extrasFilled = Boolean(existing?.tags.length || existing?.note);
  const banner = existing
    ? existing.inTrash
      ? h("p", { class: "banner banner-warn" }, icon("restore"), "This page is in your Trash. Saving restores it.")
      : h("p", { class: "banner banner-info" }, icon("check"), `Already saved in ${placeLabel(existing.folderId)}. Change anything, then Update.`)
    : null;

  show(
    h(
      "form",
      {
        class: "save-form",
        onSubmit: (event: Event) => {
          event.preventDefault();
          void save();
        },
      },
      banner,
      h(
        "section",
        { class: "page" },
        thumb([page?.image, existing?.image, tab?.favIconUrl, existing?.favicon], site, "page-thumb"),
        h("div", { class: "page-text" }, form.title, h("p", { class: "page-site" }, site)),
      ),
      h(
        "section",
        { class: "folders" },
        h("div", { class: "section-head" }, h("span", {}, "Save to"), h("span", { class: "hint" }, shortcutHint())),
        form.list,
        h("label", { class: "new-folder" }, icon("folderPlus"), form.newFolder),
      ),
      h(
        "details",
        { class: "extras", open: extrasFilled },
        h("summary", {}, icon("chevron", "icon chevron"), "Tags and note"),
        h("div", { class: "extras-body" }, h("label", { class: "field" }, icon("tag"), form.tags), form.note),
      ),
      form.error,
      h(
        "footer",
        { class: "actions" },
        h("button", { type: "button", class: "ghost", onClick: () => window.close() }, "Cancel"),
        form.submit,
      ),
    ),
  );
  if (!existing) form.submit.focus();
}

/** Picks the folder typed in "New folder…": one with that name, or a new one made on Save. */
function pickTypedFolder(): boolean {
  const name = form.newFolder.value.replace(/\s+/g, " ").trim();
  if (!name) return false;
  const match = folders.find((folder) => folder.name.toLowerCase() === name.toLowerCase());
  form.newFolder.value = "";
  choose(match ? { kind: "folder", id: match.id } : { kind: "new", name });
  return true;
}

const withSaveKeys = (event: KeyboardEvent) => event.ctrlKey || event.metaKey;

// Ctrl+Enter (⌘+Enter on a Mac) saves from anywhere in the form, even mid-note.
// A folder name still being typed is picked first, so it isn't lost.
document.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || !withSaveKeys(event) || !form.list.isConnected || saving) return;
  event.preventDefault();
  pickTypedFolder();
  form.submit.click();
});

// Enter in the title or tags saves too; Shift+Enter in the title adds a line.
form.title.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !withSaveKeys(event)) {
    event.preventDefault();
    form.submit.click();
  }
});

// Enter in "New folder…" picks that new folder instead of saving.
form.newFolder.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || withSaveKeys(event)) return;
  event.preventDefault();
  if (pickTypedFolder()) form.submit.focus();
});

// Number keys pick a folder (0 = no folder) when you're not typing.
document.addEventListener("keydown", (event) => {
  if (!form.list.isConnected || saving || event.metaKey || event.ctrlKey || event.altKey) return;
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
  if (!/^[0-9]$/.test(event.key)) return;
  const index = Number(event.key);
  if (index === 0) choose({ kind: "folder", id: null });
  else {
    const folder = folders.at(index - 1);
    if (folder && !isClosed(folder)) choose({ kind: "folder", id: folder.id });
  }
});

async function save() {
  if (saving) return;
  saving = true;
  form.error.hidden = true;
  updateSubmit();
  try {
    const result = await saveLink({
      url: pageUrl,
      html: page?.html || undefined,
      ...(choice.kind === "new" ? { newFolder: choice.name } : { folderId: choice.id }),
      title: form.title.value,
      tags: form.tags.value,
      note: form.note.value,
    });
    // A folder made by this save: add it to the list for the next save.
    const placed = result.link.folderId;
    if (choice.kind === "new" && placed && !folderFor(placed)) {
      folders = [...folders, { id: placed, name: choice.name, icon: "📁" }].sort(byName);
    }
    saving = false;
    renderDone(result.status, result.link);
  } catch (error) {
    saving = false;
    if (error instanceof ApiError && error.status === 401) return renderMessage("signed-out");
    form.error.textContent = error instanceof Error ? error.message : "Couldn't save it. Try again.";
    form.error.hidden = false;
    updateSubmit();
  }
}

// ─── After saving ───────────────────────────────────────────────────────────

function renderDone(status: SaveStatus, link: SavedLink) {
  const heading = status === "exists" ? "Updated" : status === "restored" ? "Restored and saved" : "Saved";
  const place = link.folderId ? `In ${placeLabel(link.folderId)}` : "In All links";
  show(
    h(
      "div",
      { class: "message message-done" },
      h("div", { class: "message-icon" }, icon("check")),
      h("h1", {}, heading),
      h("p", {}, place),
      h("p", { class: "done-title", title: link.title }, link.title),
      h(
        "div",
        { class: "message-actions" },
        // Undo only takes back what this popup added: never a link that was saved before.
        status !== "exists" &&
          h("button", { type: "button", class: "ghost", onClick: () => void undoSave(link) }, icon("trash"), "Undo"),
        h("button", { type: "button", class: "primary", onClick: () => openInJustLink(`/links/${link.id}`) }, "Open in JustLink", icon("external")),
      ),
    ),
  );
}

async function undoSave(link: SavedLink) {
  try {
    const removed = (await updateLink(link.id, { trashed: true })).link;
    show(
      h(
        "div",
        { class: "message" },
        h("div", { class: "message-icon" }, icon("trash")),
        h("h1", {}, "Moved to Trash"),
        h("p", {}, "It stays in the Trash for 7 days, in case you change your mind."),
        h(
          "div",
          { class: "message-actions" },
          h("button", { type: "button", class: "primary", onClick: () => void restore(removed) }, icon("restore"), "Save it again"),
        ),
      ),
    );
  } catch (error) {
    renderError(error);
  }
}

async function restore(link: SavedLink) {
  try {
    renderDone("saved", (await updateLink(link.id, { trashed: false })).link);
  } catch (error) {
    renderError(error);
  }
}

// ─── Other states ───────────────────────────────────────────────────────────

function renderLoading() {
  const url = tab?.url ?? "";
  show(
    h(
      "section",
      { class: "page" },
      thumb([tab?.favIconUrl], hostOf(url), "page-thumb"),
      h(
        "div",
        { class: "page-text" },
        h("p", { class: "page-title" }, tab?.title || hostOf(url)),
        h("p", { class: "page-site" }, hostOf(url)),
      ),
    ),
    h("div", { class: "skeleton" }, h("span"), h("span"), h("span")),
  );
}

function renderMessage(kind: "signed-out" | "unsupported" | "error", detail?: string) {
  const views = {
    "signed-out": {
      icon: icon("lock"),
      title: "Sign in to start saving",
      text: "The extension uses your JustLink account in this browser. Sign in once and you're set.",
      action: h("button", { type: "button", class: "primary", onClick: () => openInJustLink("/login") }, "Sign in to JustLink"),
    },
    unsupported: {
      icon: icon("globe"),
      title: "This page can't be saved",
      text: "Only web pages can be saved. Browser pages such as settings or a new tab can't.",
      action: h("button", { type: "button", class: "ghost", onClick: () => openInJustLink() }, "Open JustLink", icon("external")),
    },
    error: {
      icon: icon("alert"),
      title: "Something went wrong",
      text: detail ?? "Try again in a moment.",
      action: h("button", { type: "button", class: "primary", onClick: () => void main() }, "Try again"),
    },
  };
  const view = views[kind];
  show(
    h(
      "div",
      { class: `message message-${kind}` },
      h("div", { class: "message-icon" }, view.icon),
      h("h1", {}, view.title),
      h("p", {}, view.text),
      h("div", { class: "message-actions" }, view.action),
    ),
  );
}

function renderError(error: unknown) {
  if (error instanceof ApiError && error.status === 401) return renderMessage("signed-out");
  if (error instanceof ApiError && error.status === 0) {
    return renderMessage("error", `Can't reach JustLink at ${APP_ORIGIN}. Check that it's running and that you're online.`);
  }
  renderMessage("error", error instanceof Error ? error.message : undefined);
}

// ─── Start: show the page and what's already known about it ─────────────────

async function main() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url;
  if (!isSaveableUrl(url)) return renderMessage("unsupported");
  pageUrl = url;

  renderLoading();
  try {
    const [session, info, found] = await Promise.all([
      getSession(),
      tab?.id === undefined ? Promise.resolve(null) : snapshotTab(tab.id),
      findLink(url).catch((error: unknown) => {
        // Signed out: the session answer says so; anything else isn't worth stopping for.
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }),
    ]);
    if (!session.signedIn) return renderMessage("signed-out");
    folders = [...session.folders].sort(byName);
    page = info;
    existing = found;
    choice = { kind: "folder", id: found?.folderId ?? null };
    renderForm();
  } catch (error) {
    renderError(error);
  }
}

void main();

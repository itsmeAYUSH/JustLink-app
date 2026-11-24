import { ApiError, saveLink } from "./api.js";
import { APP_URL } from "./config.js";
import { isSaveableUrl, snapshotTab } from "./snapshot.js";

/**
 * The extension's service worker: right-click "Save to JustLink", and opening many
 * tabs at once for the JustLink web app (browsers block that for websites).
 */

const APP_ORIGIN = new URL(APP_URL).origin;
/** The most tabs one request opens. */
const MAX_TABS = 100;

chrome.runtime.onInstalled.addListener(() => {
  void chrome.contextMenus.removeAll().then(() => {
    chrome.contextMenus.create({ id: "save-page", title: "Save page to JustLink", contexts: ["page"] });
    chrome.contextMenus.create({ id: "save-link", title: "Save link to JustLink", contexts: ["link"] });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  void saveFromMenu(info, tab);
});

async function saveFromMenu(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) {
  const tabId = tab?.id;
  try {
    if (info.menuItemId === "save-link" && isSaveableUrl(info.linkUrl)) {
      // Another page: the server fetches its preview.
      await saveLink({ url: info.linkUrl });
    } else if (info.menuItemId === "save-page" && isSaveableUrl(tab?.url)) {
      const page = tabId === undefined ? null : await snapshotTab(tabId);
      await saveLink({ url: tab.url, html: page?.html || undefined });
    } else {
      await flash(tabId, "!", "#dc2626");
      return;
    }
    await flash(tabId, "✓", "#16a34a");
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      await chrome.tabs.create({ url: `${APP_ORIGIN}/login` });
      return;
    }
    await flash(tabId, "!", "#dc2626");
  }
}

/** Shows a short mark on the toolbar icon: ✓ saved, ! failed. */
async function flash(tabId: number | undefined, text: string, color: string) {
  await chrome.action.setBadgeBackgroundColor({ color, tabId });
  await chrome.action.setBadgeTextColor({ color: "#ffffff", tabId });
  await chrome.action.setBadgeText({ text, tabId });
  setTimeout(() => void chrome.action.setBadgeText({ text: "", tabId }), 2500);
}

type OpenTabsMessage = { type: "open-tabs"; urls: unknown };

function isOpenTabsMessage(message: unknown): message is OpenTabsMessage {
  return typeof message === "object" && message !== null && (message as { type?: unknown }).type === "open-tabs";
}

// From bridge.js on the JustLink site: open the selected links, each in its own tab.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isOpenTabsMessage(message) || sender.origin !== APP_ORIGIN) return;
  const urls = (Array.isArray(message.urls) ? message.urls : [])
    .filter((url): url is string => typeof url === "string" && isSaveableUrl(url))
    .slice(0, MAX_TABS);
  void openTabs(urls, sender.tab).then((opened) => sendResponse({ opened }));
  return true; // The answer comes later.
});

/** Opens the links next to the JustLink tab, in the background so you stay on JustLink. */
async function openTabs(urls: string[], from?: chrome.tabs.Tab): Promise<number> {
  let opened = 0;
  for (const url of urls) {
    try {
      await chrome.tabs.create({
        url,
        active: false,
        windowId: from?.windowId,
        index: from ? from.index + 1 + opened : undefined,
      });
      opened++;
    } catch {
      // Skip a link the browser refuses; open the rest.
    }
  }
  return opened;
}

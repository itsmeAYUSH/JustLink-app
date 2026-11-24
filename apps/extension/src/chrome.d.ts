/**
 * The parts of the Chrome extension API this extension uses (Manifest V3, promise style).
 * Kept by hand instead of depending on @types/chrome: the surface is small.
 */
declare namespace chrome {
  namespace runtime {
    interface MessageSender {
      id?: string;
      url?: string;
      origin?: string;
      tab?: chrome.tabs.Tab;
    }
    function getManifest(): { version: string };
    function sendMessage<T = unknown>(message: unknown): Promise<T>;
    const onMessage: {
      addListener(
        callback: (
          message: unknown,
          sender: MessageSender,
          sendResponse: (response?: unknown) => void,
        ) => boolean | void,
      ): void;
    };
    const onInstalled: { addListener(callback: () => void): void };
  }

  namespace tabs {
    interface Tab {
      id?: number;
      index: number;
      windowId: number;
      url?: string;
      title?: string;
      favIconUrl?: string;
    }
    function query(queryInfo: { active?: boolean; currentWindow?: boolean }): Promise<Tab[]>;
    function create(properties: { url: string; active?: boolean; index?: number; windowId?: number }): Promise<Tab>;
  }

  namespace scripting {
    function executeScript<Result>(injection: {
      target: { tabId: number };
      func: () => Result;
    }): Promise<{ result?: Result }[]>;
  }

  namespace contextMenus {
    interface OnClickData {
      menuItemId: string | number;
      linkUrl?: string;
      pageUrl?: string;
    }
    function create(properties: { id: string; title: string; contexts: ("page" | "link")[] }): void;
    function removeAll(): Promise<void>;
    const onClicked: { addListener(callback: (info: OnClickData, tab?: chrome.tabs.Tab) => void): void };
  }

  namespace action {
    function setBadgeText(details: { text: string; tabId?: number }): Promise<void>;
    function setBadgeBackgroundColor(details: { color: string; tabId?: number }): Promise<void>;
    function setBadgeTextColor(details: { color: string; tabId?: number }): Promise<void>;
  }
}

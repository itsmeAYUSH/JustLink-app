import { APP_URL } from "./config.js";

/**
 * Calls the JustLink web app's /api/extension endpoints. Requests carry the
 * browser's own JustLink session cookie: signing in on the website signs the
 * extension in too.
 */

/** `locked`: locked with the account's PIN; `open`: opened with it in JustLink right now. */
export type Folder = { id: string; name: string; icon: string; locked?: boolean; open?: boolean };

export type Session = { signedIn: false } | { signedIn: true; email: string | null; folders: Folder[] };

export type SavedLink = {
  id: string;
  url: string;
  title: string;
  image: string | null;
  favicon: string | null;
  siteName: string;
  folderId: string | null;
  tags: string[];
  note: string | null;
  inTrash: boolean;
  previewError: string | null;
};

/** What the popup sends on Save. Leaving out a folder keeps a saved link where it is. */
export type SaveInput = {
  url: string;
  html?: string;
  folderId?: string | null;
  newFolder?: string;
  title?: string;
  tags?: string;
  note?: string;
};

export type SaveStatus = "saved" | "exists" | "restored";

export class ApiError extends Error {
  /** 0 when JustLink couldn't be reached at all. */
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${APP_URL}${path}`, {
      method: init.method ?? "GET",
      credentials: "include",
      headers: {
        // The server only answers requests that carry this header (see lib/extension-api.ts).
        "x-justlink-client": "extension",
        ...(init.body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError(`Can't reach JustLink at ${APP_URL}.`, 0);
  }

  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) throw new ApiError(data?.error ?? `JustLink answered with an error (${response.status}).`, response.status);
  return data as T;
}

export function getSession(): Promise<Session> {
  return request<Session>("/api/extension/session");
}

/** The saved link for this page, or null when it isn't saved yet. */
export async function findLink(url: string): Promise<SavedLink | null> {
  return (await request<{ link: SavedLink | null }>(`/api/extension/links?url=${encodeURIComponent(url)}`)).link;
}

/** Saves the page (or updates it, if it was saved before) with the popup's choices. */
export function saveLink(input: SaveInput) {
  return request<{ status: SaveStatus; link: SavedLink }>("/api/extension/links", { method: "POST", body: input });
}

export function updateLink(
  id: string,
  change: { folderId?: string | null; newFolder?: string; trashed?: boolean },
) {
  return request<{ link: SavedLink; folder: Folder | null }>(`/api/extension/links/${id}`, {
    method: "PATCH",
    body: change,
  });
}

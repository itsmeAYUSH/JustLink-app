"use client";

import Link from "next/link";
import { useActionState, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { addLink, type AddLinkState } from "@/app/actions";
import type { Collection } from "@/lib/links";
import { extractUrls, MAX_LINKS_PER_PASTE } from "@/lib/paste";
import { SubmitButton } from "./submit-button";

const initialState: AddLinkState = { status: "idle" };

/**
 * Saves one link, or several at once: paste "https://a.com https://b.com …" (or one per
 * line) and each is saved as its own link.
 */
export function AddLinkForm({
  collections,
  defaultCollection,
  initialUrl = "",
}: {
  collections: Pick<Collection, "id" | "name" | "icon">[];
  defaultCollection: string | null;
  /** Pre-filled by the bookmarklet (/?url=...). */
  initialUrl?: string;
}) {
  const [state, formAction] = useActionState(addLink, initialState);
  const [text, setText] = useState(initialUrl);

  // After each save: clear the box on success, keep what was typed when it failed.
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    setText(state.status === "error" ? (state.url ?? "") : "");
  }

  const { urls, duplicates } = extractUrls(text);
  const many = urls.length > 1;
  const tooMany = urls.length > MAX_LINKS_PER_PASTE;

  /** Several links pasted at once go one per line, so it's clear they'll be saved separately. */
  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const found = extractUrls(event.clipboardData.getData("text/plain")).urls;
    if (found.length < 2) return; // One link (or none): paste as usual.
    event.preventDefault();
    const box = event.currentTarget;
    const before = text.slice(0, box.selectionStart).trimEnd();
    const after = text.slice(box.selectionEnd).trimStart();
    setText([before, found.join("\n"), after].filter(Boolean).join("\n"));
  }

  /** Enter saves, like a one-line input; Shift+Enter starts a new line. */
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <form action={formAction} className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <label htmlFor="url" className="sr-only">
          Links to save
        </label>
        <textarea
          id="url"
          name="url"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          required
          autoFocus={!!initialUrl}
          rows={Math.min(6, Math.max(1, text.split("\n").length))}
          placeholder="Paste a link, or several at once separated by spaces or new lines"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          aria-describedby={many ? "url-summary" : undefined}
          className="min-w-0 flex-1 resize-none rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm leading-5 outline-none placeholder:text-zinc-400 focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:ring-zinc-800"
        />
        <select
          name="collection_id"
          defaultValue={defaultCollection ?? ""}
          key={defaultCollection ?? "none"}
          aria-label="Folder"
          className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 sm:max-w-44"
        >
          <option value="">📥 No folder</option>
          {collections.map((collection) => (
            <option key={collection.id} value={collection.id}>
              {collection.icon} {collection.name}
            </option>
          ))}
        </select>
        <SubmitButton
          pendingText={many ? `Saving ${urls.length} links…` : "Fetching preview…"}
          disabled={tooMany}
          className="whitespace-nowrap"
        >
          {many ? `Save ${urls.length} links` : "Save link"}
        </SubmitButton>
      </div>

      {many && (
        <p id="url-summary" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span
            className={`rounded-full px-2.5 py-0.5 font-medium ${
              tooMany
                ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
                : "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200"
            }`}
          >
            {urls.length} links found
          </span>
          <span className="text-zinc-500 dark:text-zinc-400">
            {tooMany
              ? `Paste up to ${MAX_LINKS_PER_PASTE} at a time, or use Import / Export for longer lists.`
              : "Each is saved as its own link; previews load in the background."}
            {!tooMany && duplicates > 0 && ` ${duplicates} duplicate${duplicates === 1 ? " is" : "s are"} skipped.`}
          </span>
        </p>
      )}

      <p
        aria-live="polite"
        className={`min-h-5 text-sm ${
          state.status === "error" ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"
        }`}
      >
        {state.message}{" "}
        {state.existingId && (
          <Link href={`/links/${state.existingId}`} className="font-medium underline">
            View it
          </Link>
        )}
        {state.status === "idle" && initialUrl && (
          <span className="text-zinc-500">Press “Save link” to add the page you came from.</span>
        )}
      </p>
    </form>
  );
}

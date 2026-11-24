"use client";

import Link from "next/link";
import { useActionState } from "react";
import { addLink, type AddLinkState } from "@/app/actions";
import type { Collection } from "@/lib/links";
import { SubmitButton } from "./submit-button";

const initialState: AddLinkState = { status: "idle" };

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
  const value = state.status === "error" ? state.url : state.status === "idle" ? initialUrl : "";

  return (
    <form action={formAction} className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="url" className="sr-only">
          URL
        </label>
        <input
          id="url"
          name="url"
          type="text"
          inputMode="url"
          autoComplete="off"
          required
          autoFocus={!!initialUrl}
          placeholder="Paste a link, e.g. github.com/vercel/next.js"
          // React resets the form after each submit; keep the text when saving failed.
          defaultValue={value}
          key={`${state.status}-${state.url ?? ""}-${state.message ?? ""}`}
          className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:ring-zinc-800"
        />
        <select
          name="collection_id"
          defaultValue={defaultCollection ?? ""}
          key={defaultCollection ?? "none"}
          aria-label="Collection"
          className="rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 sm:max-w-44"
        >
          <option value="">📥 Unsorted</option>
          {collections.map((collection) => (
            <option key={collection.id} value={collection.id}>
              {collection.icon} {collection.name}
            </option>
          ))}
        </select>
        <SubmitButton pendingText="Fetching preview…">Save link</SubmitButton>
      </div>
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

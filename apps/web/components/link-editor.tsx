"use client";

import { useActionState, useRef } from "react";
import { updateLink, type UpdateLinkState } from "@/app/actions";
import type { Collection } from "@/lib/links";
import { SubmitButton } from "./submit-button";

const idle: UpdateLinkState = { status: "idle" };
const field =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-muted/50 focus:ring-2 focus:ring-line";

type Props = {
  link: {
    id: string;
    title: string | null;
    description: string | null;
    custom_title: string | null;
    custom_description: string | null;
    note: string | null;
    tags: string[];
    keywords: string[];
    collection_id: string | null;
  };
  collections: Pick<Collection, "id" | "name" | "icon">[];
};

/** Edits the user's own fields. Leaving title/description empty falls back to what the page says. */
export function LinkEditor({ link, collections }: Props) {
  const [state, formAction] = useActionState(updateLink, idle);
  const tagsRef = useRef<HTMLInputElement>(null);

  const addTag = (tag: string) => {
    const input = tagsRef.current;
    if (!input) return;
    const current = input.value.split(",").map((value) => value.trim()).filter(Boolean);
    if (!current.some((value) => value.toLowerCase() === tag.toLowerCase())) current.push(tag);
    input.value = current.join(", ");
  };

  const suggestions = link.keywords.filter(
    (keyword) => !link.tags.some((tag) => tag.toLowerCase() === keyword.toLowerCase()),
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={link.id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 sm:col-span-2">
          <span className="text-sm font-medium">Title</span>
          <input name="custom_title" defaultValue={link.custom_title ?? ""} placeholder={link.title ?? "Title"} className={field} />
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className="text-sm font-medium">Description</span>
          <textarea
            name="custom_description"
            rows={2}
            defaultValue={link.custom_description ?? ""}
            placeholder={link.description ?? "Description"}
            className={field}
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Tags</span>
          <input
            ref={tagsRef}
            name="tags"
            defaultValue={link.tags.join(", ")}
            placeholder="react, docs, read-later"
            className={field}
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Folder</span>
          <select name="collection_id" defaultValue={link.collection_id ?? ""} className={field}>
            <option value="">📥 No folder</option>
            {collections.map((collection) => (
              <option key={collection.id} value={collection.id}>
                {collection.icon} {collection.name}
              </option>
            ))}
          </select>
        </label>
        {suggestions.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 sm:col-span-2">
            <span className="mr-1 text-xs text-muted">Suggested from the page:</span>
            {suggestions.slice(0, 12).map((keyword) => (
              <button
                key={keyword}
                type="button"
                onClick={() => addTag(keyword)}
                className="rounded-full border border-dashed border-line px-2 py-0.5 text-xs text-muted hover:border-muted/50 hover:text-ink"
              >
                + {keyword}
              </button>
            ))}
          </div>
        )}
        <label className="space-y-1 sm:col-span-2">
          <span className="text-sm font-medium">Note</span>
          <textarea
            name="note"
            rows={3}
            defaultValue={link.note ?? ""}
            placeholder="Why you saved it, what to remember…"
            className={field}
          />
        </label>
      </div>

      <div className="flex items-center gap-3">
        <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
        {state.message && (
          <span
            aria-live="polite"
            className={`text-sm ${state.status === "error" ? "text-danger" : "text-brand-ink"}`}
          >
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}

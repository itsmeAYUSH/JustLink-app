"use client";

import { useActionState, useState } from "react";
import { updateCollection, type CollectionState } from "@/app/actions";
import { SubmitButton } from "./submit-button";

const idle: CollectionState = { status: "idle" };
const input =
  "rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950";

/** Renames a folder or changes its icon. */
export function EditCollectionForm({ id, name, icon }: { id: string; name: string; icon: string }) {
  const [state, formAction] = useActionState(updateCollection, idle);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="id" value={id} />
      <input name="icon" defaultValue={icon} aria-label="Icon (emoji)" className={`${input} w-10 text-center`} />
      <input name="name" defaultValue={name} required maxLength={60} aria-label="Name" className={`${input} min-w-0 flex-1`} />
      <SubmitButton variant="secondary" pendingText="Saving…" className="py-1.5">
        Rename
      </SubmitButton>
      {state.message && (
        <p className={`w-full text-xs ${state.status === "error" ? "text-red-600" : "text-emerald-600"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}

export function CopyButton({ text, label = "Copy link" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
    >
      {copied ? "Copied ✓" : label}
    </button>
  );
}

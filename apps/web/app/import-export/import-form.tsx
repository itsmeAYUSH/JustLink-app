"use client";

import Link from "next/link";
import { useActionState } from "react";
import { importBookmarks, type ImportState } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";

const idle: ImportState = { status: "idle" };

export function ImportForm() {
  const [state, formAction] = useActionState(importBookmarks, idle);

  return (
    <form action={formAction} className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm font-medium">Bookmarks file</span>
        <input
          type="file"
          name="file"
          accept=".html,.htm,.txt,.csv,text/html,text/plain"
          className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-subtle file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink hover:file:bg-line"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">…or paste links</span>
        <textarea
          name="text"
          rows={4}
          placeholder={"https://nextjs.org/docs\nhttps://supabase.com/docs\n…one per line, or any text containing links"}
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs outline-none focus:border-muted/50"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="folders" defaultChecked className="size-4" />
        Turn bookmark folders into collections
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingText="Importing…">Import</SubmitButton>
        {state.message && (
          <span
            aria-live="polite"
            className={`text-sm ${state.status === "error" ? "text-danger" : "text-brand-ink"}`}
          >
            {state.message}{" "}
            {state.status === "success" && (
              <Link href="/" className="font-medium underline">
                Go to your links
              </Link>
            )}
          </span>
        )}
      </div>
    </form>
  );
}

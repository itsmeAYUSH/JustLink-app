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
          className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-zinc-700 dark:file:bg-white dark:file:text-zinc-900"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">…or paste links</span>
        <textarea
          name="text"
          rows={4}
          placeholder={"https://nextjs.org/docs\nhttps://supabase.com/docs\n…one per line, or any text containing links"}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950"
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
            className={`text-sm ${state.status === "error" ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}
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

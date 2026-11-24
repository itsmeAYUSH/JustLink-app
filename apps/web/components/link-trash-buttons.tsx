"use client";

import { useTransition } from "react";
import { restoreLinks, trashLinks } from "@/app/actions";
import { RestoreIcon, SpinnerIcon, TrashIcon } from "./icons";
import { idsFormData, shortTitle, useToast } from "./toast";

const iconButton =
  "relative z-10 inline-flex size-8 items-center justify-center rounded-md text-zinc-400 transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-wait";

/** The Undo button on a "Moved to Trash" toast. */
export function undoTrash(ids: string[]) {
  return {
    label: "Undo",
    run: async () => {
      const result = await restoreLinks(null, idsFormData(ids));
      if (result?.error) return { message: result.error, tone: "error" as const };
      return { message: ids.length === 1 ? "Link restored" : `${ids.length} links restored` };
    },
  };
}

/** Moves one link to the Trash right away (it can be restored), with Undo in the toast. */
export function TrashLinkButton({ id, title }: { id: string; title: string }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  function trash() {
    startTransition(async () => {
      const result = await trashLinks(null, idsFormData([id]));
      if (result?.error) toast.show({ message: result.error, tone: "error" });
      else toast.show({ message: `Moved “${shortTitle(title)}” to Trash`, action: undoTrash([id]) });
    });
  }

  return (
    <button
      type="button"
      onClick={trash}
      disabled={pending}
      title="Move to Trash"
      aria-label={`Move “${title}” to Trash`}
      className={`${iconButton} hover:bg-rose-50 hover:text-rose-600 focus-visible:ring-rose-500/40 dark:hover:bg-rose-950/60 dark:hover:text-rose-400`}
    >
      {pending ? <SpinnerIcon className="size-4" /> : <TrashIcon className="size-4" />}
    </button>
  );
}

/** Takes one link out of the Trash, back to wherever it was. */
export function RestoreLinkButton({ id, title, labeled = false }: { id: string; title: string; labeled?: boolean }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  function restore() {
    startTransition(async () => {
      const result = await restoreLinks(null, idsFormData([id]));
      if (result?.error) toast.show({ message: result.error, tone: "error" });
      else toast.show({ message: `Restored “${shortTitle(title)}”` });
    });
  }

  const icon = pending ? <SpinnerIcon className="size-4" /> : <RestoreIcon className="size-4" />;

  if (labeled) {
    return (
      <button
        type="button"
        onClick={restore}
        disabled={pending}
        className="relative z-10 inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium text-indigo-600 transition-colors hover:bg-indigo-50 focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none disabled:cursor-wait dark:text-indigo-300 dark:hover:bg-indigo-500/10"
      >
        {icon}
        Restore
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={restore}
      disabled={pending}
      title="Restore"
      aria-label={`Restore “${title}”`}
      className={`${iconButton} hover:bg-indigo-50 hover:text-indigo-600 focus-visible:ring-indigo-500/40 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-300`}
    >
      {icon}
    </button>
  );
}

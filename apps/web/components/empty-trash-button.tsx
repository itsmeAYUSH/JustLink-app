"use client";

import { useActionState, useRef } from "react";
import { emptyTrash, type LinksActionState } from "@/app/actions";
import { DeleteDialog } from "./delete-dialog";
import { TrashIcon } from "./icons";
import { useToast } from "./toast";

/** Deletes everything in the Trash for good, after asking. */
export function EmptyTrashButton({ count }: { count: number }) {
  const toast = useToast();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [state, formAction, isPending] = useActionState<LinksActionState, FormData>(async () => {
    const result = await emptyTrash();
    if (result && !result.error) {
      dialogRef.current?.close();
      toast.show({ message: result.count === 1 ? "Deleted 1 link for good" : `Deleted ${result.count} links for good` });
    }
    return result;
  }, null);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          dialogRef.current?.showModal();
          cancelRef.current?.focus();
        }}
        aria-haspopup="dialog"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-rose-500/40 focus-visible:outline-none dark:border-red-900 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-950"
      >
        <TrashIcon className="size-4" />
        Empty Trash
      </button>

      <DeleteDialog
        ref={dialogRef}
        cancelRef={cancelRef}
        id="empty-trash"
        heading="Empty the Trash?"
        subject={count === 1 ? "1 link" : `${count} links`}
        description="They're deleted right away instead of at the end of their 7 days, with their notes and tags. This can't be undone."
        confirmLabel="Empty Trash"
        action={formAction}
        pending={isPending}
        error={state?.error}
      >
        {null}
      </DeleteDialog>
    </>
  );
}

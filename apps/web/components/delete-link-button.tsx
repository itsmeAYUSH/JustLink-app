"use client";

import { useActionState, useRef } from "react";
import { deleteLinksForever, type LinksActionState } from "@/app/actions";
import { DeleteDialog } from "./delete-dialog";
import { TrashIcon } from "./icons";
import { shortTitle, useToast } from "./toast";

type Props = {
  id: string;
  /** Shown in the confirmation, so it's clear which link goes. */
  title: string;
  /** "icon": a small button for cards and rows. "button": a labeled button for the link's own page. */
  variant?: "icon" | "button";
  /** Go back to the Trash afterwards (the link's own page no longer exists). */
  redirectToTrash?: boolean;
};

/** Deletes a link that is already in the Trash for good, after asking: this can't be undone. */
export function DeleteLinkButton({ id, title, variant = "icon", redirectToTrash = false }: Props) {
  const toast = useToast();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [state, formAction, isPending] = useActionState<LinksActionState, FormData>(async (previous, formData) => {
    const result = await deleteLinksForever(previous, formData);
    if (result && !result.error) {
      dialogRef.current?.close();
      toast.show({ message: `Deleted “${shortTitle(title)}” for good` });
    }
    return result;
  }, null);

  function open() {
    dialogRef.current?.showModal();
    cancelRef.current?.focus();
  }

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={open}
          title="Delete forever"
          aria-label={`Delete “${title}” forever`}
          aria-haspopup="dialog"
          className="relative z-10 inline-flex size-8 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-600 focus-visible:ring-2 focus-visible:ring-rose-500/40 focus-visible:outline-none dark:hover:bg-rose-950/60 dark:hover:text-rose-400"
        >
          <TrashIcon className="size-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={open}
          aria-haspopup="dialog"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-rose-500/40 focus-visible:outline-none dark:border-red-900 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-950"
        >
          <TrashIcon className="size-4" />
          Delete forever
        </button>
      )}

      <DeleteDialog
        ref={dialogRef}
        cancelRef={cancelRef}
        id={`delete-${id}`}
        heading="Delete this link forever?"
        subject={<p className="line-clamp-2">{title}</p>}
        description="It's deleted right away instead of at the end of its 7 days in the Trash, with its notes and tags. This can't be undone."
        confirmLabel="Delete forever"
        action={formAction}
        pending={isPending}
        error={state?.error}
      >
        <input type="hidden" name="id" value={id} />
        {redirectToTrash && <input type="hidden" name="redirect" value="trash" />}
      </DeleteDialog>
    </>
  );
}

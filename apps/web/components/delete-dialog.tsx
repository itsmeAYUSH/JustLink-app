import type { ReactNode, RefObject } from "react";
import { SpinnerIcon, TrashIcon } from "./icons";

type Props = {
  ref: RefObject<HTMLDialogElement | null>;
  /** Focused when the dialog opens, so pressing Enter by habit doesn't delete. */
  cancelRef: RefObject<HTMLButtonElement | null>;
  /** Unique per dialog on the page, for the aria ids. */
  id: string;
  heading: string;
  /** What is about to be deleted, shown in a gray box. */
  subject: ReactNode;
  description: string;
  confirmLabel: string;
  action: (formData: FormData) => void;
  pending: boolean;
  error?: string;
  /** Hidden inputs that say what to delete. */
  children: ReactNode;
};

/** A modal "are you sure?" for deleting. Open it with `ref.current.showModal()`. */
export function DeleteDialog({
  ref,
  cancelRef,
  id,
  heading,
  subject,
  description,
  confirmLabel,
  action,
  pending,
  error,
  children,
}: Props) {
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;

  function close() {
    if (!pending) ref.current?.close();
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      // Escape closes the dialog, except while the delete is running.
      onCancel={(event) => {
        if (pending) event.preventDefault();
      }}
      // A click on the backdrop lands on the <dialog> itself; clicks inside land on the form.
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-zinc-200 bg-white p-0 text-left text-base font-normal text-zinc-900 shadow-2xl backdrop:bg-zinc-950/50 backdrop:backdrop-blur-sm open:motion-safe:animate-fade-up dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
    >
      <form action={action} className="p-6">
        {children}

        <div className="flex gap-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400">
            <TrashIcon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-semibold">
              {heading}
            </h2>
            <div className="mt-2 rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium break-words text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
              {subject}
            </div>
            <p id={descriptionId} className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
              {description}
            </p>
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={close}
            disabled={pending}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-zinc-400/50 focus-visible:outline-none disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-w-28 items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-rose-500 focus-visible:ring-2 focus-visible:ring-rose-500/50 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-wait disabled:opacity-80 dark:focus-visible:ring-offset-zinc-900"
          >
            {pending ? (
              <>
                <SpinnerIcon />
                Deleting…
              </>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </form>
    </dialog>
  );
}

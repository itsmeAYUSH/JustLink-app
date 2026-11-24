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
  /** Choices shown under the description, such as what happens to a folder's links. */
  options?: ReactNode;
  confirmLabel: string;
  action: (formData: FormData) => void;
  pending: boolean;
  error?: string;
  /** Hidden inputs that say what to delete. */
  children: ReactNode;
  onClose?: () => void;
};

/** A modal "are you sure?" for deleting. Open it with `ref.current.showModal()`. */
export function DeleteDialog({
  ref,
  cancelRef,
  id,
  heading,
  subject,
  description,
  options,
  confirmLabel,
  action,
  pending,
  error,
  children,
  onClose,
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
      onClose={onClose}
      // Escape closes the dialog, except while the delete is running.
      onCancel={(event) => {
        if (pending) event.preventDefault();
      }}
      // A click on the backdrop lands on the <dialog> itself; clicks inside land on the form.
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-line bg-surface p-0 text-left text-base font-normal text-ink shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm open:motion-safe:animate-fade-up"
    >
      <form action={action} className="p-6">
        {children}

        <div className="flex gap-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-danger-soft text-danger">
            <TrashIcon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-semibold">
              {heading}
            </h2>
            <div className="mt-2 rounded-lg bg-subtle px-3 py-2 text-sm font-medium break-words text-ink">
              {subject}
            </div>
            <p id={descriptionId} className="mt-3 text-sm text-muted">
              {description}
            </p>
            {options}
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-danger-soft p-3 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={close}
            disabled={pending}
            className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-subtle focus-visible:ring-2 focus-visible:ring-line/50 focus-visible:outline-none disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-w-28 items-center justify-center gap-2 rounded-lg bg-danger px-4 py-2 text-sm font-medium text-on-brand shadow-sm transition-colors hover:bg-danger/90 focus-visible:ring-2 focus-visible:ring-danger/50 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-wait disabled:opacity-80"
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

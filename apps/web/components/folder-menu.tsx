"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useId, useRef, useState, useTransition, type RefObject } from "react";
import { deleteCollection, setCollectionPublic, updateCollection, type CollectionState } from "@/app/actions";
import { FOLDER_ICONS } from "@/lib/folders";
import { DeleteDialog } from "./delete-dialog";
import { CheckIcon, CopyIcon, LinkIcon, MoreIcon, PencilIcon, SpinnerIcon, TrashIcon, XIcon } from "./icons";
import { useToast } from "./toast";

type MenuFolder = { id: string; name: string; icon: string; isPublic: boolean; isLocked: boolean; shareId: string };

const item =
  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-zinc-100 focus-visible:bg-zinc-100 focus-visible:outline-none disabled:opacity-50 dark:hover:bg-zinc-800 dark:focus-visible:bg-zinc-800";

/**
 * The ⋯ menu beside a folder's name: rename it, share it, copy its link or delete it.
 * Kept out of sight so folders stay clean; locking is done from the profile page.
 */
export function FolderMenu({ folder, shareUrl }: { folder: MenuFolder; shareUrl: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const renameRef = useRef<HTMLDialogElement>(null);
  const deleteRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [sharing, startSharing] = useTransition();

  // Open the menu under its button, lined up with its left edge.
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const place = (event: Event) => {
      const trigger = triggerRef.current;
      if ((event as ToggleEvent).newState !== "open" || !trigger) return;
      const rect = trigger.getBoundingClientRect();
      menu.style.top = `${rect.bottom + 6}px`;
      menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 272))}px`;
      menu.style.right = "auto";
      menu.style.bottom = "auto";
    };
    menu.addEventListener("beforetoggle", place);
    return () => menu.removeEventListener("beforetoggle", place);
  }, []);

  const link = () => shareUrl ?? `${window.location.origin}/s/${folder.shareId}`;

  async function copyLink() {
    menuRef.current?.hidePopover();
    await navigator.clipboard.writeText(link());
    toast.show({ message: "Share link copied" });
  }

  function toggleSharing() {
    menuRef.current?.hidePopover();
    const formData = new FormData();
    formData.append("id", folder.id);
    formData.append("value", String(!folder.isPublic));
    startSharing(async () => {
      await setCollectionPublic(formData);
      if (folder.isPublic) {
        toast.show({ message: "Sharing stopped. The link no longer works." });
      } else {
        await navigator.clipboard.writeText(link()).catch(() => {});
        toast.show({ message: "Shared publicly. Link copied." });
      }
      router.refresh();
    });
  }

  const [deleteState, deleteAction, deleting] = useActionState<CollectionState, FormData>(async (_previous, formData) => {
    await deleteCollection(formData); // goes back to All links
    return { status: "success" };
  }, { status: "idle" });

  return (
    <>
      {folder.isPublic && (
        <button
          type="button"
          onClick={() => void copyLink()}
          title="Copy the share link"
          className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
        >
          <LinkIcon className="size-3" />
          Shared
        </button>
      )}
      <button
        ref={triggerRef}
        type="button"
        popoverTarget={menuId}
        title="Folder options"
        aria-label="Folder options"
        aria-haspopup="menu"
        disabled={sharing}
        className="grid size-8 place-items-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:outline-none dark:hover:bg-zinc-800 dark:hover:text-white"
      >
        {sharing ? <SpinnerIcon className="size-4" /> : <MoreIcon className="size-5" />}
      </button>

      <div
        ref={menuRef}
        id={menuId}
        popover="auto"
        role="menu"
        aria-label="Folder options"
        className="fixed inset-auto m-0 w-64 rounded-xl border border-zinc-200 bg-white p-1.5 text-left text-sm font-normal text-zinc-800 shadow-2xl shadow-zinc-950/15 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:shadow-black/50"
      >
        <button
          type="button"
          role="menuitem"
          className={item}
          onClick={() => {
            menuRef.current?.hidePopover();
            renameRef.current?.showModal();
          }}
        >
          <PencilIcon className="size-4 text-zinc-500" />
          Rename or change icon
        </button>
        {folder.isLocked ? (
          <p className="flex items-center gap-2.5 px-2.5 py-2 text-zinc-400">
            <LinkIcon className="size-4" />
            Locked folders can&apos;t be shared
          </p>
        ) : (
          <>
            <button type="button" role="menuitem" className={item} onClick={toggleSharing}>
              <LinkIcon className="size-4 text-zinc-500" />
              {folder.isPublic ? "Stop sharing" : "Share publicly"}
            </button>
            {folder.isPublic && (
              <button type="button" role="menuitem" className={item} onClick={() => void copyLink()}>
                <CopyIcon className="size-4 text-zinc-500" />
                Copy share link
              </button>
            )}
          </>
        )}
        <div aria-hidden="true" className="my-1.5 h-px bg-zinc-100 dark:bg-zinc-800" />
        <button
          type="button"
          role="menuitem"
          className={`${item} text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10`}
          onClick={() => {
            menuRef.current?.hidePopover();
            deleteRef.current?.showModal();
            cancelRef.current?.focus();
          }}
        >
          <TrashIcon className="size-4" />
          Delete folder
        </button>
      </div>

      <RenameDialog dialogRef={renameRef} folder={folder} />

      <DeleteDialog
        ref={deleteRef}
        cancelRef={cancelRef}
        id={`delete-folder-${folder.id}`}
        heading="Delete this folder?"
        subject={
          <p>
            {folder.icon} {folder.name}
          </p>
        }
        description={
          folder.isLocked
            ? "Its links are kept and move to No folder, where they're no longer locked."
            : "Its links are kept and move to No folder."
        }
        confirmLabel="Delete folder"
        action={deleteAction}
        pending={deleting}
        error={deleteState.status === "error" ? deleteState.message : undefined}
      >
        <input type="hidden" name="id" value={folder.id} />
      </DeleteDialog>
    </>
  );
}

function RenameDialog({
  dialogRef,
  folder,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  folder: MenuFolder;
}) {
  const router = useRouter();
  const toast = useToast();
  const titleId = useId();
  const [icon, setIcon] = useState(folder.icon);
  const [state, formAction, pending] = useActionState<CollectionState, FormData>(async (previous, formData) => {
    const result = await updateCollection(previous, formData);
    if (result.status === "success") {
      dialogRef.current?.close();
      toast.show({ message: "Folder renamed" });
      router.refresh();
    }
    return result;
  }, { status: "idle" });
  const icons = FOLDER_ICONS.includes(folder.icon) ? FOLDER_ICONS : [folder.icon, ...FOLDER_ICONS];

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-zinc-200 bg-white p-0 text-left text-base font-normal text-zinc-900 shadow-2xl backdrop:bg-zinc-950/50 backdrop:backdrop-blur-sm open:motion-safe:animate-fade-up dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
    >
      <form action={formAction} className="p-6">
        <input type="hidden" name="id" value={folder.id} />
        <input type="hidden" name="icon" value={icon} />
        <div className="flex items-start gap-4">
          <h2 id={titleId} className="min-w-0 flex-1 text-lg font-semibold">
            Rename folder
          </h2>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="Close"
            className="grid size-8 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <XIcon className="size-4" />
          </button>
        </div>
        <div className="mt-4 flex gap-2">
          <span
            aria-hidden="true"
            className="grid size-11 shrink-0 place-items-center rounded-xl border border-zinc-200 bg-zinc-50 text-xl dark:border-zinc-700 dark:bg-zinc-800"
          >
            {icon}
          </span>
          <input
            name="name"
            defaultValue={folder.name}
            required
            maxLength={60}
            aria-label="Folder name"
            autoComplete="off"
            className="h-11 min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-indigo-400"
          />
        </div>
        <div role="radiogroup" aria-label="Folder icon" className="mt-2 flex flex-wrap gap-1">
          {icons.map((emoji) => (
            <button
              key={emoji}
              type="button"
              role="radio"
              aria-checked={icon === emoji}
              aria-label={emoji}
              onClick={() => setIcon(emoji)}
              className={`grid size-8 place-items-center rounded-lg text-lg transition ${
                icon === emoji
                  ? "bg-indigo-100 ring-2 ring-indigo-500 dark:bg-indigo-500/20 dark:ring-indigo-400"
                  : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              {emoji}
            </button>
          ))}
        </div>
        {state.status === "error" && <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{state.message}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {pending ? <SpinnerIcon /> : <CheckIcon className="size-4" />}
            Save
          </button>
        </div>
      </form>
    </dialog>
  );
}
